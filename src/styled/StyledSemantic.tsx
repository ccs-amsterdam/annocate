import styled from "styled-components";

// Use styled components to customize semantic ui components.
// Note that !important is still nicely contained, because styled components
// creates unique class names.

// On the longer term, we might want to remove semantic-ui altogether.
// therefore we'll run all semantic ui components via custom styled versions,
// so that we can gradually replace them.

const CodeButton = styled.button<{
  $color?: string;
  $background?: string;
  $borderColor?: string;
  $size?: number;
  $selected?: boolean;
  $current?: boolean;
  $afterBackground?: string;
  $darkBackground?: boolean;
  $compact?: boolean;
  $flex?: string;
  $maxWidth?: string;
  $minWidth?: string;
}>`
  font-size: ${(p) => p.$size || 1}rem;
  padding: ${(p) => (p.$compact ? "0.5rem" : "0.5rem")};
  min-height: ${(p) => (p.$compact ? "" : "5rem")};
  margin: 0;

  cursor: pointer;
  border: 3px solid;
  border-radius: 5px;
  position: relative;
  transition: background-color 0.15s;
  overflow-wrap: break-word;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  text-decoration: ${(p) => (p.$current ? "underline" : "")};
  color: ${(p) => (p.$selected || p.$current ? "white" : "#222")};
  border-color: ${(p) => {
    if (p.$darkBackground) {
      if (p.$selected || p.$current) return "var(--background-fixed)";
      return "var(--background-inversed-fixed)";
    }
    if (p.$selected || p.$current) return "var(--background-inversed)";
    return "var(--background)";
  }};
  background: ${(p) => p.$background || "var(--primary-transparent)"};
  flex: ${(p) => (p.$compact && !p.$flex ? "0.2 1 auto" : p.$flex || "1 1 auto")};
  max-width: ${(p) => p.$maxWidth || "none"};
  min-width: ${(p) => p.$minWidth || "none"};

  & > i {
    margin: 0;
  }

  &.left {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  &.right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  &.middle {
    border-radius: 0;
  }

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${(p) => {
      if (!p.$selected && !p.$current) return "#fff";
      if (p.$selected && p.$current) return "#333";
      return "#999";
    }};
    z-index: -1;
  }

  :hover {
    border-color: ${(p) => (p.$darkBackground ? "var(--background-fixed)" : "var(--background-inversed)")};
  }

  :disabled {
    color: grey;
    cursor: not-allowed;
  }
`;

const StyledButton = styled.button<{
  $size?: number;
  $primary?: boolean;
  $secondary?: boolean;
  $fluid?: boolean;
}>`
  position: relative;
  font-size: ${(p) => p.$size || 1}rem;
  padding: 0.7em 1em 0.7em 1rem;
  margin: 0;
  cursor: pointer;
  border: none;
  border-radius: 5px;

  position: relative;
  transition: all 0.15s;

  &.left {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  &.right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  &.middle {
    border-radius: 0;
  }

  svg {
    transform: translateY(${(p) => (p?.$size || 0) * (1 / 7.5) || 0.2 + "rem"});
    margin-right: 0.5rem;
  }

  ${(p) => {
    if (p.$primary) {
      return `
      background: var(--primary);
      color: white;
      &.selected, &:hover, &:active {
        background: var(--primary-dark);
      }
        `;
    } else if (p.$secondary) {
      return `
      background: var(--secondary);
      color: #222;
      &.selected, &:hover, &:active {
        background: var(--secondary-dark);
        color: white;
      }
        `;
    }
    return `
      &.selected, &:hover, &:active {
        
        color: var(--primary-text)
      }
      `;
  }}

  &:disabled {
    cursor: not-allowed;
    background: grey;
  }

  &.loading::after {
    position: absolute;
    content: "";
    top: 50%;
    right: 3%;
    width: 1.5rem;
    height: 1.5rem;
    margin-top: -0.75rem;
    margin-left: -0.75rem;
    border: 2px solid #fff;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
  }

  ${(p) => {
    if (p.$fluid)
      return `
      width: 100%;
      flex: 1 1 auto;
    `;
  }}
`;

const Button = StyledButton;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: nowrap;

  & > button {
    border-radius: 0;
  }

  & > button:first-of-type {
    border-top-left-radius: 5px;
    border-bottom-left-radius: 5px;
  }
  & > button:last-of-type {
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
  }
`;

const StyledContainer = styled.div`
  margin-left: auto;
  margin-right: auto;
  width: 100%;
  overflow: auto;
  padding: 1em;
`;

const StyledSegment = styled.div`
  position: relative;
  padding: 1em;
`;

export { Button, ButtonGroup, CodeButton, StyledButton, StyledContainer, StyledSegment };
