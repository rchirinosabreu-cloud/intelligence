import ChatInterface from "./components/ChatInterface.jsx";
import SplashScreen from "./components/SplashScreen.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-base text-ink">
      <SplashScreen />
      <ChatInterface />
    </div>
  );
}
