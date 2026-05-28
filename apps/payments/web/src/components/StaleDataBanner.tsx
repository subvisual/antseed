/**
 * StaleDataBanner — shows a quiet "couldn't refresh" notice when the last
 * fetch failed but cached data is still displayed.
 *
 * Only renders when there is an error AND there is cached data to display —
 * i.e. we are in graceful-degrade mode (show old data + quiet warning).
 */
import './Skeleton.scss';

interface StaleDataBannerProps {
  /** True when the latest fetch attempt failed. */
  hasError: boolean;
  /** True when we have cached/previous data to show (not empty). */
  hasCachedData: boolean;
  /** Optional custom message. */
  message?: string;
}

export function StaleDataBanner({
  hasError,
  hasCachedData,
  message = "Couldn't refresh — showing last known data",
}: StaleDataBannerProps) {
  if (!hasError || !hasCachedData) return null;

  return (
    <div className="stale-data-notice" role="status" aria-live="polite">
      <span className="stale-data-notice__dot" aria-hidden="true" />
      {message}
    </div>
  );
}
