"use client";

import { useEffect, useRef, useState } from "react";
import { BLD, H, W } from "./engine/defs";
import { LEGEND, drawLegendIcon } from "./engine/legend";
import type { Sprites } from "./engine/renderer";
import { Terrarium, type Followed, type Panel } from "./engine/terrarium";
import styles from "./terrarium.module.css";

const NOTICES: Partial<Record<Panel["status"], string>> = {
  connecting: "Finding Sunhollow…",
  reconnecting: "Lost the line to Sunhollow. Trying again…",
  full: "Sunhollow has all the visitors it can hold right now. This page will try again shortly.",
  crowded:
    "Too many windows are watching Sunhollow from your network. Close one and this page will reconnect.",
  outdated: "Sunhollow has changed since this page was loaded.",
  resting: "Resting while this tab was in the background.",
};

export function TerrariumView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Terrarium | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sprites, setSprites] = useState<Sprites | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const terrarium = new Terrarium(canvas.current!, setPanel);
    engine.current = terrarium;
    setSprites(terrarium.sprites);
    return () => {
      terrarium.destroy();
      engine.current = null;
    };
  }, []);

  const notice = panel ? NOTICES[panel.status] : NOTICES.connecting;

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <h1>Sunhollow</h1>
        <span className={styles.clock}>{panel?.clock}</span>
        <div className={styles.music}>
          <button
            className={playing ? styles.on : undefined}
            title="Procedural lo-fi"
            onClick={() => setPlaying(engine.current?.toggleMusic() ?? false)}
          >
            {playing ? "♪ playing" : "♪ music"}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={60}
            title="Volume"
            aria-label="Music volume"
            onChange={(e) => engine.current?.setVolume(+e.target.value)}
          />
        </div>
        {panel && (
          <div className={styles.stocks}>
            <Stock
              color="#f2c14e"
              title="Light above the cap spills away as glow. Battery lofts raise the cap."
            >
              {panel.light} light
            </Stock>
            <Stock color="#6fbf73">{panel.leaf} leaf</Stock>
            <Stock color="#c46d3b">{panel.metal} metal</Stock>
            <Stock color="#57c5d6">{panel.water} water</Stock>
            <Stock color="#6be3d9">{panel.tenders} tenders</Stock>
            <Stock color="#d64f9b">{panel.reach}</Stock>
          </div>
        )}
      </header>

      <div className={styles.stage}>
        <canvas ref={canvas} className={styles.world} width={W} height={H} />
        <div className={styles.zoomLevel}>{panel?.zoom ?? "1×"}</div>
        <div className={styles.zoomer}>
          <button title="Zoom in" onClick={() => engine.current?.stepZoom(1)}>
            +
          </button>
          <button title="Zoom out" onClick={() => engine.current?.stepZoom(-1)}>
            −
          </button>
          <button title="Whole city" onClick={() => engine.current?.showAll()}>
            ⊡
          </button>
          <button title="Highest floor" onClick={() => engine.current?.showTop()}>
            ▲
          </button>
          <button title="Street" onClick={() => engine.current?.showStreet()}>
            ●
          </button>
          <button title="Deepest mine" onClick={() => engine.current?.showDeep()}>
            ▼
          </button>
        </div>
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            {panel?.status === "outdated" && (
              <button onClick={() => location.reload()}>Reload</button>
            )}
          </div>
        )}
      </div>

      <div className={styles.log} aria-live="polite">
        {panel?.log.map((line) => (
          <div key={line.id}>{line.text}</div>
        ))}
      </div>

      <section className={styles.box}>
        <h2>Almanac</h2>
        <div className={styles.almanac}>
          {panel?.almanac.length
            ? panel.almanac.map((entry, i) => (
                <div key={`${entry.day}-${i}-${entry.text}`}>
                  <span>Day {entry.day}</span> — {entry.text}
                </div>
              ))
            : "Nothing has happened yet. Leave it running."}
        </div>
        {panel?.daysLeft != null && panel.daysLeft <= 10 && (
          <div className={styles.hint}>
            {panel.daysLeft <= 1
              ? "This is the town's last day. A new one begins at dawn."
              : `${panel.daysLeft} days until the tenders move on and begin again.`}
          </div>
        )}
      </section>

      <section className={styles.box}>
        {panel?.followed ? (
          <Following tender={panel.followed} cameraFree={panel.cameraFree} />
        ) : (
          <>
            <h2>Nobody followed yet</h2>
            <div className={styles.hint}>
              Click a tender to ride along. Drag to pan, scroll or + / − to zoom, shift-scroll to
              climb. Click any room to learn what it does.
            </div>
          </>
        )}
      </section>

      <section className={styles.box}>
        <h2>The Wild Stack</h2>
        <div className={styles.wildStage}>{panel?.wildStage}</div>
        {panel?.wildRows.map((row) => (
          <div className={styles.wildRow} key={row.key}>
            <span className={row.balanced ? styles.ok : styles.bad}>{row.label}</span>
            <Bar value={row.plants} title="plants" />
            <span>
              {row.creatures.map((c) => (
                <span key={c.color} style={{ color: c.color }}>
                  ●{c.count}{" "}
                </span>
              ))}
            </span>
            <span />
            <span className={styles.wildNote}>{row.note}</span>
          </div>
        ))}
        {!!panel?.wildRows.length && (
          <div className={styles.hint}>
            Marsh pods are open to the rain and pipe it down into the tide atrium, a sealed tank
            where <b style={{ color: "#9fd8e8" }}>minnows</b> graze kelp,{" "}
            <b style={{ color: "#c47bd9" }}>pike</b> hunt minnows, and{" "}
            <b style={{ color: "#e0563f" }}>crabs</b> enrich the bed; herons in a linked atrium will
            fish it. The cedar atrium counts as two pods and seals its own columns; its canopy % is
            how tall the cedars are. Green bar: plants (30–85%). Creatures:{" "}
            <b style={{ color: "#f2c14e" }}>moths</b> pollinate and feed{" "}
            <b style={{ color: "#6fbf73" }}>frogs</b>; <b style={{ color: "#e37bb6" }}>finches</b>{" "}
            carry seed through the tubes; <b style={{ color: "#6be3d9" }}>herons</b> roost on top
            and eat frogs; <b style={{ color: "#e9dcc0" }}>moss-goats</b> graze hard and enrich the
            soil. Herding moves goats from bare pods to overgrown ones.
          </div>
        )}
      </section>

      <section className={styles.box}>
        <h2>Council</h2>
        <div className={styles.hint}>{panel?.council}</div>
      </section>

      <section className={styles.box}>
        <h2>Rain flow</h2>
        <div className={styles.hint}>{panel?.rain}</div>
      </section>

      <section className={styles.box}>
        <h2>What they build</h2>
        <div className={styles.legend}>
          {sprites &&
            LEGEND.map((kind) => (
              <div key={kind} title={BLD[kind].blurb}>
                <canvas
                  width={40}
                  height={32}
                  ref={(c) => {
                    if (c) drawLegendIcon(c, kind, sprites);
                  }}
                />
                <span>{BLD[kind].name}</span>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}

function Stock({
  color,
  title,
  children,
}: {
  color: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={styles.stock} title={title}>
      <i style={{ background: color }} />
      {children}
    </span>
  );
}

function Bar({ value, title, tone }: { value: number; title?: string; tone?: string }) {
  return (
    <div className={`${styles.bar} ${tone ?? ""}`} title={title}>
      <b style={{ width: `${Math.round(value)}%` }} />
    </div>
  );
}

function Following({ tender, cameraFree }: { tender: Followed; cameraFree: boolean }) {
  const { bars } = tender;
  return (
    <>
      <h2>
        <span className={styles.tenderName}>{tender.name}</span>{" "}
        <span className={styles.about}>{tender.about}</span>
      </h2>
      <div className={styles.follow}>
        <div className={styles.thought}>{tender.thought}</div>
        <div className={styles.traits}>
          <span>energy</span>
          <Bar value={bars.energy} tone={styles.energy} />
          <span>joy</span>
          <Bar value={bars.joy} tone={styles.joy} />
          <span>curious</span>
          <Bar value={bars.curious} />
        </div>
        <div className={styles.traits}>
          <span>chatty</span>
          <Bar value={bars.chatty} />
          <span>diligent</span>
          <Bar value={bars.diligent} />
          <span>whimsy</span>
          <Bar value={bars.whimsy} />
        </div>
        <div className={`${styles.hint} ${styles.doing}`}>
          {tender.doing}
          {cameraFree && " — camera unlocked, click them to re-track"}
        </div>
      </div>
    </>
  );
}
