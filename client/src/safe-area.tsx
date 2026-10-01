// Standalone replacement for the hosted platform's safe-area scrim:
// reserves space for the device notch / status bar using the CSS env().
export function SafeAreaTopScrim({ backgroundColor }: { backgroundColor?: string }) {
  return <div aria-hidden style={{ height: "env(safe-area-inset-top)", backgroundColor }} />;
}
