/**
 * AnnoTinder's mark: four lines of text drawn as sticks of kindling (the
 * tinder), with two small side twigs. One colour: `currentColor`, by
 * default the scheme's wood colour (`text-wood`). Also reads as a menu
 * icon, which the header uses on narrow screens.
 */
const LOGO_PATHS = [
  "M8 19.3Q30 17.6 52 17.5Q53.8 16 52 14.5Q30 12.8 8 12.8Q5.1 16 8 19.3Z",
  "M34.9 16.9Q37.8 13.8 40.4 10.4Q40.4 9.6 39.6 9.6Q36.6 12.6 33.1 15.1Q33.2 16.8 34.9 16.9Z",
  "M8 32.3Q32.5 32.1 57 30.5Q58.8 29 57 27.5Q32.5 27.3 8 25.8Q5.1 29 8 32.3Z",
  "M8 45Q26 43.6 44 43.4Q45.6 42 44 40.7Q26 39.2 8 39Q5.3 42 8 45Z",
  "M25.1 42.9Q27.7 45.3 30.6 47.4Q31.4 47.4 31.4 46.6Q28.9 44.1 26.9 41.1Q25.2 41.2 25.1 42.9Z",
  "M8 56.8Q29 56.6 50 55.2Q51.5 54 50 52.8Q29 52.6 8 51.3Q5.5 54 8 56.8Z",
];

export function Logo({ className = "h-7 w-7 text-wood", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {/* Centred and inset like an icon (the twigs span y 9.6–57.4): sits on the text line, not above or below it */}
      <g transform="translate(32 32) scale(0.82) translate(-32 -33.5)">
        {LOGO_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
