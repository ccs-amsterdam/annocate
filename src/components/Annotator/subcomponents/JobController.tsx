import React, { ReactElement, useState } from "react";
import IndexController from "./IndexController";
import Finished from "./Finished";
import { CodeBook, FullScreenNode, JobServer, SetState } from "@/app/types";
import { DarkModeButton, FontSizeButton } from "@/components/Common/Theme";
import MenuButtonGroup from "./MenuButtonGroup";
import styled from "styled-components";
import { FaWindowClose } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface JobControllerProps {
  children: ReactElement;
  jobServer: JobServer;
  codebook: CodeBook;
  unitIndex: number;
  setUnitIndex: (index: number) => void;
  unitProgress: number;
  fullScreenButton: ReactElement;
  fullScreenNode: FullScreenNode;
  cantLeave: boolean;
  authForm?: ReactElement;
  health?: any;
}

const StyledWrapper = styled.div<{ maxWidth: string; maxHeight: string }>`
  max-height: ${(p) => p.maxHeight};
  margin: 0 auto;
  height: 100%;
  width: 100%;
  background: hsl(var(--background));
  overflow: auto;
  /* display: flex;
  flex-direction: column; */

  .Menubar {
    position: sticky;
    top: 0;
    left: 0;

    height: 40px;
    width: 100;
    padding: 3px 5px 0px 5px;
    display: flex;
    justify-content: space-between;
    color: hsl(var(--primary-foreground));
    font-size: 2rem;
    z-index: 9000;

    backdrop-filter: blur(2px);
    background: linear-gradient(hsl(var(--background)) 10%, hsl(var(--background), 0.5) 70%, transparent 100%);

    .InnerMenuBar {
      margin: 0 auto;
      width: 100%;
      max-width: ${(p) => p.maxWidth};
      display: flex;
    }

    .IndexController {
      flex: 1 1 auto;
      padding-top: 4px;
      padding-right: 10px;
    }
  }
  .Annotator {
    margin: 0 auto;
    width: 100%;
    max-width: ${(p) => p.maxWidth};
    height: calc(100% - 40px);
  }
`;

/**
 * Render an annotator for the provided jobServer class
 *
 * @param {*} jobServer  A jobServer class
 */
const JobController = ({
  children,
  jobServer,
  codebook,
  unitIndex,
  setUnitIndex,
  unitProgress,
  fullScreenButton,
  fullScreenNode,
  cantLeave,
  authForm,
  health,
}: JobControllerProps) => {
  const [maxHeight, maxWidth] = getMaxWindowSize(codebook);
  const [openExitModal, setOpenExitModal] = useState(false);

  return (
    <StyledWrapper maxHeight={maxHeight} maxWidth={maxWidth}>
      <div className="Menubar">
        <div className="InnerMenuBar">
          <div className="IndexController">
            <IndexController
              n={jobServer?.progress?.n_total}
              progressN={unitProgress}
              index={unitIndex}
              setIndex={setUnitIndex}
              canGoBack={jobServer?.progress?.seek_backwards}
              canGoForward={jobServer?.progress?.seek_forwards}
            />
          </div>
          <HeartContainer damage={health?.damage} maxDamage={health?.maxDamage} />
          <div>
            <MenuButtonGroup>
              <FontSizeButton />
              <DarkModeButton />
              {fullScreenButton}
              {!cantLeave && <FaWindowClose onClick={() => setOpenExitModal(!openExitModal)} />}
            </MenuButtonGroup>
          </div>
        </div>
      </div>
      <div className="Annotator">
        {unitIndex < jobServer?.progress?.n_total ? children : <Finished jobServer={jobServer} />}
      </div>
      <Dialog open={openExitModal} onOpenChange={setOpenExitModal}>
        <DialogContent>
          <div style={{ display: "flex", minWidth: "150px", minHeight: "50px" }}>
            {jobServer?.return_link ? <BackToOverview jobServer={jobServer} setOpen={setOpenExitModal} /> : authForm}
          </div>
        </DialogContent>
      </Dialog>
    </StyledWrapper>
  );
};

const BackToOverviewStyle = styled.div`
  font-size: 1.6rem;
  text-align: center;
  .buttons {
    display: flex;
    gap: 1rem;
  }
`;

const BackToOverview = (props: { jobServer: JobServer; setOpen: (open: boolean) => void }) => {
  const router = useRouter();
  if (!props.jobServer?.return_link) return null;
  return (
    <BackToOverviewStyle>
      <h3>Do you want to leave the current session?</h3>
      <div className="buttons">
        <Button
          className="w-full"
          onClick={() => {
            router.push(props.jobServer.return_link);
          }}
        >
          Leave
        </Button>
        <Button className="w-full" variant="secondary" onClick={() => props.setOpen(false)}>
          Stay
        </Button>
      </div>
    </BackToOverviewStyle>
  );
};

const getMaxWindowSize = (codebook: CodeBook) => {
  switch (codebook?.type) {
    case "questions":
      return ["100%", "1000px"];
    case "annotate":
      return ["100%", "2000px"];
    default:
      return ["100%", "100%"];
  }
};

const HeartContainer = ({ damage, maxDamage, hearts = 5 }: { damage: number; maxDamage: number; hearts?: number }) => {
  if (damage == null || maxDamage == null) return null;
  const healthPct = (100 * (maxDamage - damage)) / maxDamage;

  return (
    <div
      className="test"
      style={{
        paddingTop: "5px",
        height: "100%",
        color: "black",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <span>{Math.ceil(healthPct)}%</span>
      {/* <Icon
        size="large"
        name="heart"
        style={{
          margin: "0px 3px",
          color: "transparent",
          background: `linear-gradient(to top, red ${healthPct}%, #000000aa ${healthPct}% 100%, #000000aa 100%)`,
        }}
      /> */}
    </div>
  );
};

export default React.memo(JobController);
