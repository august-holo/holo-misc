//! The solarpunk terrarium: one shared world, simulated here and watched by
//! anyone over a WebSocket. Open to the public, so every viewer is limited.

mod hub;
mod sim;

use std::{net::IpAddr, sync::Arc, time::Duration};

use axum::{
    Router,
    extract::{
        ConnectInfo, State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    http::{HeaderMap, StatusCode, header::ORIGIN},
    response::{IntoResponse, Response},
    routing::get,
};

use crate::AppState;
pub use hub::Hub;
use hub::{Refusal, Ticket};

/// Viewers only listen for now; anything they send is small and ignored.
const MAX_INCOMING: usize = 1024;
/// A viewer that cannot take a message for this long is gone.
const SEND_TIMEOUT: Duration = Duration::from_secs(10);

// Close codes the page understands, from the range reserved for applications.
const CLOSE_GOING_AWAY: u16 = 1001;
const CLOSE_FULL: u16 = 4001;
const CLOSE_TOO_MANY: u16 = 4002;

pub fn router() -> Router<AppState> {
    Router::new().route("/solarpunk-terrarium/ws", get(connect))
}

async fn connect(
    State(hub): State<Arc<Hub>>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    let origin = headers.get(ORIGIN).and_then(|v| v.to_str().ok());
    if !origin.is_some_and(|o| hub.allows_origin(o)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let address = viewer_address(&headers).unwrap_or(peer.ip());
    let admission = hub.admit(address);

    upgrade
        .max_message_size(MAX_INCOMING)
        .max_frame_size(MAX_INCOMING)
        .on_upgrade(move |socket| async move {
            match admission {
                Ok(ticket) => watch(socket, hub, ticket).await,
                // A browser cannot see why a handshake failed, so accept and say why.
                Err(refusal) => refuse(socket, refusal).await,
            }
        })
}

/// CloudFront appends the address it saw to X-Forwarded-For; earlier entries
/// come from the client and cannot be trusted.
fn viewer_address(headers: &HeaderMap) -> Option<IpAddr> {
    headers
        .get("x-forwarded-for")?
        .to_str()
        .ok()?
        .rsplit(',')
        .next()?
        .trim()
        .parse()
        .ok()
}

async fn refuse(socket: WebSocket, refusal: Refusal) {
    match refusal {
        Refusal::Full => close(socket, CLOSE_FULL, "full").await,
        Refusal::TooManyFromAddress => close(socket, CLOSE_TOO_MANY, "too many connections").await,
    }
}

async fn close(mut socket: WebSocket, code: u16, reason: &'static str) {
    let frame = CloseFrame {
        code,
        reason: reason.into(),
    };
    let _ = socket.send(Message::Close(Some(frame))).await;
}

async fn watch(mut socket: WebSocket, hub: Arc<Hub>, _ticket: Ticket) {
    let mut world = hub.world();
    let mut frame = hub.frame();
    let mut closing = hub.closing();
    // A new viewer needs the city as it stands before anything else.
    world.mark_changed();

    loop {
        let message = tokio::select! {
            biased;
            _ = closing.changed() => {
                // The page reconnects by itself once the server is back.
                close(socket, CLOSE_GOING_AWAY, "restarting").await;
                return;
            }
            changed = world.changed() => match changed {
                Ok(()) => world.borrow_and_update().clone(),
                Err(_) => break,
            },
            changed = frame.changed() => match changed {
                Ok(()) => frame.borrow_and_update().clone(),
                Err(_) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => continue,
            },
        };
        let sent = tokio::time::timeout(SEND_TIMEOUT, socket.send(Message::Binary(message))).await;
        if !matches!(sent, Ok(Ok(()))) {
            break;
        }
    }
}
