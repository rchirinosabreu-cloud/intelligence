import CallToAction from "./CallToAction.jsx";
import HeroImage from "./HeroImage.jsx";

export default function ChatHeader() {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <HeroImage size="sm" />
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-ink/60">Brainstudio</p>
          <h1 className="text-xl font-semibold">Brainstudio Intelligence</h1>
        </div>
      </div>
      <CallToAction />
    </header>
  );
}
