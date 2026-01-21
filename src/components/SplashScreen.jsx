import { useEffect, useState } from "react";
import HeroImage from "./HeroImage.jsx";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1700);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-base transition-opacity">
      <HeroImage />
      <p className="text-lg font-semibold">Brainstudio Intelligence</p>
    </div>
  );
}
