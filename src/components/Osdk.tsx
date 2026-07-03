import { AnchorButton, Icon, Tag } from "@blueprintjs/core";
import React from "react";
import css from "./Osdk.module.css";

const DOCUMENTATION_URL =
  "https://atamer-labs.euw-3.palantirfoundry.co.uk/workspace/developer-console/app/ri.third-party-applications.main.application.7984d417-ec31-488f-b863-3069fe3fc74d/docs/guide/loading-data?language=typescript";

function Osdk(): React.ReactElement {
  return (
    <div className={css.osdk}>
      <div>
        <span>OSDK: </span>
        <Tag minimal={true}>@crisis-logistics-command-app/sdk</Tag>
      </div>
      <AnchorButton
        href={DOCUMENTATION_URL}
        target="_blank"
        rel="noreferrer"
        variant="minimal"
        icon={<Icon icon="book" aria-label="Book icon"></Icon>}
      >
        View documentation
      </AnchorButton>
    </div>
  );
}

export default Osdk;
