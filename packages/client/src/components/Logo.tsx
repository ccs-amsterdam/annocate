/**
 * AnnoTinder's mark: four lines of text drawn as sticks of kindling, a small
 * side twig, and a dry eucalyptus leaf caught on the third twig (the tinder).
 * Twigs in `currentColor` (by default the scheme's wood, `text-wood`), the
 * leaf in the leaf colour (`--leaf`); `mono` draws the leaf in
 * `currentColor` too. Also reads as a menu icon, which the header uses on
 * narrow screens. `smoke`: wisps rising from the first twig (LogoSmoke), for
 * places where the logo is the centre of attention.
 */
const LOGO_PATHS = [
  "M8 19.3Q30 17.6 52 17.5Q53.8 16 52 14.5Q30 12.8 8 12.8Q5.1 16 8 19.3Z",
  "M34.9 16.9Q37.8 13.8 40.4 10.4Q40.4 9.6 39.6 9.6Q36.6 12.6 33.1 15.1Q33.2 16.8 34.9 16.9Z",
  "M8 32.3Q32.5 32.1 57 30.5Q58.8 29 57 27.5Q32.5 27.3 8 25.8Q5.1 29 8 32.3Z",
  "M8 45Q26 43.6 44 43.4Q45.6 42 44 40.7Q26 39.2 8 39Q5.3 42 8 45Z",
  "M8 56.8Q29 56.6 50 55.2Q51.5 54 50 52.8Q29 52.6 8 51.3Q5.5 54 8 56.8Z",
];

/** The dry leaf on the third twig, and its midrib. */
const LEAF = "M0 0C3.15 -2.94 7.88 -2.63 10.5 0C7.88 2.31 3.15 2.73 0 0Z";
const LEAF_TRANSFORM = "translate(26 42.5) rotate(50)";

/** Two wisps of smoke from the first twig (animated in index.css, `.logo-smoke`). */
const SMOKE = [
  "M50 14C46 9 53 6 49.5 1C47.5 -2 50 -5 51.5 -7",
  "M45 14C42 10 47 7 44.5 3C43 1 44.5 -2 45.5 -3",
];

export function Logo({
  className = "h-7 w-7 text-wood",
  title,
  mono = false,
  smoke = false,
}: {
  className?: string;
  title?: string;
  mono?: boolean;
  smoke?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="currentColor"
      overflow={smoke ? "visible" : undefined}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {/* Centred and inset like an icon (the twigs span y 9.6–57.4): sits on the text line, not above or below it */}
      <g transform="translate(32 32) scale(0.82) translate(-32 -33.5)">
        {smoke && (
          <g className="logo-smoke" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            {SMOKE.map((d) => (
              <path key={d} d={d} pathLength={60} />
            ))}
          </g>
        )}
        {LOGO_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
        <g transform={LEAF_TRANSFORM}>
          <path d={LEAF} fill={mono ? "currentColor" : "var(--leaf)"} />
          {!mono && <path d="M0.84 0L8.93 0" stroke="currentColor" strokeWidth={0.9} opacity={0.55} />}
        </g>
      </g>
    </svg>
  );
}

/**
 * The logo with smoke rising, and an optional label under it: loading screens
 * and the welcome page, where the logo is the centre of attention (not the
 * header). The smoke stands still when the system asks for reduced motion.
 */
export function LogoSmoke({ label, className = "h-16 w-16" }: { label?: string; className?: string }) {
  return (
    <div role={label ? "status" : undefined} className="flex flex-col items-center gap-3">
      <Logo smoke className={`${className} text-wood`} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
