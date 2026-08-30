import type { RunwayView } from './runway-state';
import './release-runway-sections.css';
import ReplaySection from './sections/ReplaySection';

type ReleaseRunwaySectionsProps = {
  view: RunwayView;
  reducedMotion: boolean;
  illustrative: boolean;
};

export default function ReleaseRunwaySections({
  view,
  reducedMotion,
  illustrative
}: ReleaseRunwaySectionsProps) {
  return (
    <div className="runway-story" aria-label="How ForgeCanary checks a release">
      <ReplaySection view={view} reducedMotion={reducedMotion} illustrative={illustrative} />
    </div>
  );
}
