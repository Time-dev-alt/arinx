import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function StudioNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const items = [
    { to: "/studio", label: "Dashboard & content" },
    { to: "/studio/upload", label: "Upload" },
    { to: "/studio/customize", label: "Customization" },
  ] as const;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="mr-4 font-display text-2xl font-bold">Studio</span>
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium",
            path.replace(/\/$/, "") === i.to
              ? "bg-foreground text-background"
              : "bg-muted hover:bg-accent",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function readAsDataURL(file: File, maxW = 1280): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = url;
  });
}
