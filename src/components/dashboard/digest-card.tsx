import { formatMonthLabel } from "@/lib/format";

interface DigestCardProps {
  text: string;
  toolNames: string[];
  reportMonth: string;
}

export function DigestCard({ text, toolNames, reportMonth }: DigestCardProps) {
  return (
    <section className="card-glass p-5">
      <div className="flex items-center gap-2">
        {/* Cropped to the icon's mark only — see assist-widget.tsx's comment
            on the same image for why (full app-icon square includes text
            below the mark that would otherwise show, tiny, at this size). */}
        <img
          src="/pod-assist-icon.png"
          alt=""
          className="h-6 w-6 origin-[53%_10%] scale-[1.6] rounded-full object-cover"
        />
        <p className="text-sm font-semibold text-foreground">Pod Assist — action points for {formatMonthLabel(reportMonth)}</p>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      {toolNames.length > 0 && <p className="mt-2 text-xs text-muted-foreground/70">Checked: {toolNames.join(", ")}</p>}
    </section>
  );
}
