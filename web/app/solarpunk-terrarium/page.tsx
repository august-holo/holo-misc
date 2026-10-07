import type { Metadata } from "next";
import { Pixelify_Sans } from "next/font/google";
import { TerrariumView } from "./terrarium-view";

const pixelify = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "Sunhollow",
  description: "A solarpunk town that builds itself, shared by everyone watching.",
};

export default function Page() {
  return (
    <div className={pixelify.className}>
      <TerrariumView />
    </div>
  );
}
