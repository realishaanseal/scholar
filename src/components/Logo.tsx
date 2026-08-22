import Image from "next/image";

/** Icon-only brand mark. Use for compact placements: nav bars, page headers, favicons-in-app. */
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/logo-mark.png"
      alt="Varaxis Scholar"
      width={size}
      height={size}
      priority
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}

/** Full lockup (mark + wordmark). Use for larger, standalone placements like the auth screen. */
export function LogoFull({ width = 220 }: { width?: number }) {
  const height = Math.round(width * 1.0); // source asset is roughly square
  return (
    <Image
      src="/logo-full.png"
      alt="Varaxis Scholar"
      width={width}
      height={height}
      priority
      style={{ width, height: "auto" }}
    />
  );
}
