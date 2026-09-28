import ravanLogo from "../assets/ravan-logo.png";

interface PoweredByRavanProps {
  textColor?: string;
}

const PoweredByRavan = ({ textColor = "#6b7280" }: PoweredByRavanProps) => (
  <div className="shrink-0 flex justify-center py-2">
    <a
      href="https://ravan.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] leading-none opacity-80 hover:opacity-100 transition-opacity"
      style={{
        color: textColor,
        backgroundColor: `${textColor}14`,
        border: `1px solid ${textColor}26`,
      }}
    >
      <span>Powered by</span>
      <img
        src={ravanLogo}
        alt="Ravan.ai"
        className="h-[18px] w-auto"
        draggable={false}
      />
    </a>
  </div>
);

export default PoweredByRavan;
