import type { RunwayView } from './runway-state';
import './release-runway-sections.css';
import EvidenceSection from './sections/EvidenceSection';
import HumanControlSection from './sections/HumanControlSection';
import ReleaseProofSection from './sections/ReleaseProofSection';
import ReplaySection from './sections/ReplaySection';

type ReleaseRunwaySectionsProps = {
  view: RunwayView;
  reducedMotion: boolean;
  illustrative: boolean;
  trueforgeUrl?: string;
};

export default function ReleaseRunwaySections({
  view,
  reducedMotion,
  illustrative,
  trueforgeUrl
}: ReleaseRunwaySectionsProps) {
  return (
    <div className="runway-story" aria-label="How ForgeCanary checks a release">
      <ReplaySection view={view} reducedMotion={reducedMotion} illustrative={illustrative} />
      <EvidenceSection view={view} reducedMotion={reducedMotion} />
      <HumanControlSection view={view} reducedMotion={reducedMotion} illustrative={illustrative} />
      <ReleaseProofSection
        view={view}
        reducedMotion={reducedMotion}
        illustrative={illustrative}
        trueforgeUrl={trueforgeUrl}
      />
    </div>
  );
}
