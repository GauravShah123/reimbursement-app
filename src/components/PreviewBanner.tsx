// Always-visible notice that this deployment is a preview of the real product.
export function PreviewBanner({ onShowCaseStudy }: { onShowCaseStudy?: () => void }) {
  return (
    <div className="preview-banner" role="note">
      <strong>Public preview of the real product.</strong> Sample data only.
      {onShowCaseStudy && (
        <>
          {" "}
          <button className="preview-banner__link" onClick={onShowCaseStudy}>How it's built →</button>
        </>
      )}
    </div>
  );
}
