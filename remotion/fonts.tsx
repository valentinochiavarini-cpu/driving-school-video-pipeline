import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const FACES: [string, number][] = [["Inter-Regular", 400], ["Inter-Medium", 500], ["Inter-SemiBold", 600], ["Inter-Bold", 700], ["Inter-ExtraBold", 800], ["Inter-Black", 900]];
let loaded: Promise<void> | null = null;

export function useInter() {
  const [handle] = useState(() => delayRender("Loading Inter"));
  useEffect(() => {
    loaded ??= Promise.all(FACES.map(([file, weight]) => {
      const face = new FontFace("Inter", `url(${staticFile(`fonts/${file}.otf`)})`, { weight: String(weight) });
      return face.load().then((f) => { document.fonts.add(f); });
    })).then(() => undefined);
    loaded.then(() => continueRender(handle)).catch((e) => { console.error(e); continueRender(handle); });
  }, [handle]);
}
