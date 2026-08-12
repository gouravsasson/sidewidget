import whatsappIcon from "../assets/whatsapp-svgrepo-com.svg";

// WhatsApp hand-off button shown next to the chat Send button.
//
// Keyed by Snowie agent_id: an agent that isn't listed here renders nothing,
// so every other widget's chat row stays exactly as it was.
const WHATSAPP_LINKS: Record<string, string> = {
  // Dr. Jwan Murad — same link the Whatsapp widget already uses on their site.
  "c95a3759-bb70-4463-a3b1-390910ed46e8":
    "https://wa.me/971566337748?text=Hi%2C%20I%E2%80%99d%20like%20to%20contact%20Dr.%20Jwan%20Murad%E2%80%99s%20admin%20team%20for%20more%20information",
};

const WhatsappHandoff = ({ agentId }: { agentId: string }) => {
  const link = WHATSAPP_LINKS[agentId];
  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      className="flex items-center justify-center w-12 h-12 flex-shrink-0 hover:scale-110 transition-transform"
    >
      <img
        src={whatsappIcon}
        alt="WhatsApp"
        className="w-8 h-8 object-contain"
      />
    </a>
  );
};

export default WhatsappHandoff;
