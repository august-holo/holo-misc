// The small pictures in "What they build", as the original page drew them.

import { BLD, capOffset } from "./defs";
import type { Sprites } from "./renderer";

const BLOCKS: Record<string, [string, string]> = {
  battery: ["#2c4550", "#6be3d9"],
  apiary: ["#e9dcc0", "#d98b3a"],
  loom: ["#d9cbae", "#e37bb6"],
  cable: ["#b3c3c6", "#6be3d9"],
  aviary: ["#cdeff5", "#e37bb6"],
  foundry: ["#4a2f1b", "#e0563f"],
  mistnet: ["#1b3440", "#cdeff5"],
  belltower: ["#1b3440", "#f2c14e"],
  pier: ["#1b3440", "#e37bb6"],
  observatory: ["#1b3440", "#b3c3c6"],
};

export const LEGEND = Object.keys(BLD).filter((k) => !BLD[k].hidden);

export function drawLegendIcon(c: HTMLCanvasElement, k: string, SPR: Sprites) {
  const x = c.getContext("2d")!;
  x.fillStyle = BLD[k].below ? "#4a2f1b" : "#1b3440";
  x.fillRect(0, 0, 40, 32);
  const col = BLOCKS[k];
  if (col) {
    x.fillStyle = col[0];
    x.fillRect(2, 2, 36, 28);
    x.fillStyle = col[1];
    x.fillRect(12, 10, 16, 12);
    x.fillStyle = "#1c1a2e";
    x.fillRect(12, 22, 16, 2);
  } else if (k === "cottage") {
    x.fillStyle = "#1f3d3c";
    x.fillRect(2, 2, 36, 28);
    x.fillStyle = "#e9dcc0";
    x.fillRect(12, 14, 16, 12);
    x.fillStyle = "#2f7a44";
    x.fillRect(10, 11, 20, 3);
    x.fillRect(13, 8, 14, 3);
    x.fillStyle = "#f2c14e";
    x.fillRect(21, 17, 4, 4);
    x.fillStyle = "#4a2f1b";
    x.fillRect(15, 19, 4, 7);
  } else if (k === "grand") {
    x.fillStyle = "#1f3d3c";
    x.fillRect(2, 4, 36, 26);
    x.fillStyle = "#cdeff5";
    x.fillRect(6, 1, 28, 4);
    x.fillStyle = "#5a3a22";
    x.fillRect(19, 12, 3, 18);
    x.fillStyle = "#2f7a44";
    x.fillRect(12, 8, 17, 4);
    x.fillRect(14, 13, 13, 4);
    x.fillRect(16, 18, 9, 4);
    x.fillStyle = "#8a5a34";
    x.fillRect(3, 16, 12, 1);
    x.fillRect(25, 22, 12, 1);
  } else if (k === "hall") {
    x.fillStyle = "#e9dcc0";
    x.fillRect(2, 2, 36, 28);
    x.fillStyle = "#7a5a34";
    x.fillRect(6, 20, 28, 2);
    x.fillStyle = "#f2c14e";
    [8, 18, 28].forEach((cx) => x.fillRect(cx, 6, 3, 3));
    x.fillStyle = "#c46d3b";
    x.fillRect(30, 12, 6, 8);
  } else if (k === "lagoon") {
    x.fillStyle = "#12303a";
    x.fillRect(2, 2, 36, 28);
    x.fillStyle = "#2f8fa6";
    x.fillRect(3, 10, 34, 19);
    x.fillStyle = "#6fbf73";
    [8, 18, 28].forEach((cx) => x.fillRect(cx, 16, 1, 13));
    x.fillStyle = "#9fd8e8";
    x.fillRect(12, 14, 3, 1);
    x.fillRect(24, 20, 3, 1);
  } else if (k === "marsh") {
    x.drawImage(SPR["wild"], 0, 0);
    x.fillStyle = "#22403f";
    x.fillRect(1, 0, 38, 2);
    x.fillStyle = "#2f8fa6";
    x.fillRect(2, 16, 36, 6);
    x.fillStyle = "#6fbf73";
    [6, 14, 22, 30].forEach((cx) => x.fillRect(cx, 8, 1, 12));
  } else if (k === "atrium") {
    x.fillStyle = "#22403f";
    x.fillRect(2, 2, 36, 28);
    x.fillStyle = "#5a3a22";
    [8, 20, 32].forEach((cx) => x.fillRect(cx, 10, 2, 20));
    x.fillStyle = "#2f7a44";
    [8, 20, 32].forEach((cx) => {
      x.fillRect(cx - 3, 8, 8, 3);
      x.fillRect(cx - 2, 5, 6, 3);
      x.fillRect(cx - 1, 3, 4, 2);
    });
  } else if (SPR[k]) x.drawImage(SPR[k], 0, capOffset(k));
}
