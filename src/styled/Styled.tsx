import styled from "styled-components";

export const CenteredDiv = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  width: 100%;
  position: relative;
`;

export const Loader = styled.div<{
  $active?: boolean;
  $radius?: number;
  $content?: string;
  $transitionTime?: number;
  $background?: string;
  $blur?: number;
}>`
  --r: ${(p) => (p.$radius != null ? p.$radius + "px" : "30px")};
  pointer-events: none;
  opacity: ${(p) => (p.$active ? 1 : 0)};
  transition: all ${(p) => p.$transitionTime || 0}s;

  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  z-index: 100;
  background-color: ${(p) => p.$background || "hsl(var(--background), 0.5)"};
  backdrop-filter: ${(p) => `${p.$blur || 3}px`};

  &::after {
    content: "";
    position: absolute;
    z-index: 1000;
    top: calc(50% - var(--r));
    left: calc(50% - var(--r));
    background: transparent;
    border: calc(var(--r) / 4) solid var(--primary-light);
    border-top: calc(var(--r) / 4) solid hsl(var(--primary));
    border-radius: 50%;
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    animation: spinNonLinear 1s linear infinite;
    opacity: 0.5;
  }

  &::before {
    content: "${(p) => p.$content}";
    position: fixed;
    z-index: 1001;
    top: calc(50% - var(--r) / 2);
    font-weight: bold;
    font-size: 0.9rem;
    color: hsl(var(--primary-foreground));
    left: 50%;
    transform: translateX(-50%);
    overflow: show;
    white-space: nowrap;
    width: auto;
    border: calc(var(--r) / 4) solid transparent;
  }
`;
