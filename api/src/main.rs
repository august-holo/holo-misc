mod auth;
mod modules;

use std::{net::SocketAddr, sync::Arc};

use axum::{Router, extract::FromRef};

#[derive(Clone, FromRef)]
pub struct AppState {
    verifier: Arc<auth::Verifier>,
    terrarium: Arc<modules::terrarium::Hub>,
}

/// The monolith: each module owns its routes and state and is mounted under /api.
/// Modules talk to each other only through their public functions, never their internals.
fn app(state: AppState) -> Router {
    Router::new()
        .nest(
            "/api",
            Router::new()
                .merge(modules::health::router())
                .merge(modules::identity::router())
                .merge(modules::terrarium::router()),
        )
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_ansi(false).init();
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("no other TLS provider is installed");

    // Sites allowed to open a socket from a browser, comma separated.
    let origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000".into())
        .split(',')
        .map(|o| o.trim().to_string())
        .collect();
    let terrarium = modules::terrarium::Hub::start(origins);
    let state = AppState {
        verifier: Arc::new(auth::Verifier::from_env()?),
        terrarium: terrarium.clone(),
    };

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on http://{addr}");
    let service = app(state).into_make_service_with_connect_info::<SocketAddr>();
    axum::serve(listener, service)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            terrarium.close();
        })
        .await?;
    Ok(())
}

/// systemd stops the service with SIGTERM; finish in-flight requests and close sockets first.
async fn shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut term = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    tokio::select! {
        _ = term.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}
