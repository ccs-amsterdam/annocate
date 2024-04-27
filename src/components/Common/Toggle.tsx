import styled from "styled-components";
import { SetState } from "../../../types";

const StyledDiv = styled.div<{ size?: number }>`
  font-size: ${(props) => props.size || 30}px;
  .Toggle {
    position: relative;
    display: inline-block;
    width: 1.2em;
    height: 0.74em;
    border-radius: 0.74em;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--primary-foreground));
    transition: all 0.2s;
  }

  .Toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .Toggle label {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    cursor: pointer;
    border-radius: 0.68em;
    transition: all 0.2s;
  }

  .Toggle label:before {
    position: absolute;
    content: "";
    height: 0.52em;
    width: 0.52em;
    left: 0.08em;
    bottom: 0.08em;
    background: hsl(var(--primary-foreground));
    transition: all 0.2s;
    border-radius: 50%;
  }

  .Toggle input:checked + label {
    background-color: hsl(var(--primary-foreground));
  }

  .Toggle input:checked + label:before {
    transform: translateX(0.44em);
    background: hsl(var(--background));
  }

  .Toggle input:focus + label {
    box-shadow: 0 0 1px hsl(hsl(var(--primary)));
  }
`;

export default function Toggle(props: { checked: boolean; setChecked: SetState<boolean> }) {
  return (
    <StyledDiv size={30}>
      <div className="Toggle" onClick={() => props.setChecked(!props.checked)}>
        <input readOnly type="checkbox" id="toggle" checked={props.checked} />
        <label htmlFor="toggle" />
      </div>
    </StyledDiv>
  );
}
