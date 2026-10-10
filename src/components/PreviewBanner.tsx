// Always-visible notice that this deployment is a simulation, not the real product.
export function PreviewBanner() {
  return (
    <div className="preview-banner" role="note">
      <strong>This is a public preview.</strong> Information here is not real. The real product is
      protected with Google OAuth.
    </div>
  );
}
