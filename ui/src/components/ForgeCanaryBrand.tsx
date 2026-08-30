type ForgeCanaryBrandProps = {
  href: string;
  className?: string;
  ariaLabel?: string;
};

export function ForgeCanaryBrand({
  href,
  className = '',
  ariaLabel = 'ForgeCanary'
}: ForgeCanaryBrandProps) {
  return (
    <a className={`forgecanary-brand ${className}`.trim()} href={href} aria-label={ariaLabel}>
      <img
        className="forgecanary-brand__mark"
        src="/images/brand/forgecanary-mark.png"
        width="512"
        height="512"
        alt=""
        decoding="sync"
      />
      <span>ForgeCanary</span>
    </a>
  );
}

