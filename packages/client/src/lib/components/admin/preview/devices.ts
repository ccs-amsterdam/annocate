/** The frames a preview can be shown in. */
export type DeviceMode = "mobile" | "desktop";

export interface DeviceSize {
  width: number;
  height: number;
}

/** How the preview is shown: in a phone or a desktop frame of a size (kept per frame), or over the full width. */
export interface DeviceView {
  mode: DeviceMode;
  fullWidth: boolean;
  sizes: Record<DeviceMode, DeviceSize>;
}

export const INITIAL_VIEW: DeviceView = {
  mode: "mobile",
  fullWidth: false,
  sizes: { mobile: { width: 375, height: 667 }, desktop: { width: 1024, height: 768 } },
};

interface DevicePreset extends DeviceSize {
  label: string;
}

export const PRESETS: Record<DeviceMode, DevicePreset[]> = {
  mobile: [
    { label: "Small (320×568)", width: 320, height: 568 },
    { label: "iPhone SE (375×667)", width: 375, height: 667 },
    { label: "iPhone 15 (393×852)", width: 393, height: 852 },
    { label: "Large Phone (414×896)", width: 414, height: 896 },
  ],
  desktop: [
    { label: "Tablet (768×1024)", width: 768, height: 1024 },
    { label: "Desktop Standard (1024×768)", width: 1024, height: 768 },
    { label: "Laptop HD (1280×800)", width: 1280, height: 800 },
  ],
};

/** The view with the current frame at another size. */
export function withSize(view: DeviceView, size: Partial<DeviceSize>): DeviceView {
  return { ...view, sizes: { ...view.sizes, [view.mode]: { ...view.sizes[view.mode], ...size } } };
}

/** The preset the current frame's size is, if any. */
export function presetOf(view: DeviceView): DevicePreset | undefined {
  const { width, height } = view.sizes[view.mode];
  return PRESETS[view.mode].find((p) => p.width === width && p.height === height);
}
