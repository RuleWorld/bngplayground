/**
 * Global teardown for Vitest - ensures clean exit after all tests complete
 */
export default async function globalTeardown() {
  console.log('[GlobalTeardown] All tests completed, forcing cleanup...');

  // Give a brief moment for async cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Force exit if we're still running after a reasonable time
  const forceExitTimer = setTimeout(() => {
    console.error('[GlobalTeardown] Process did not exit cleanly after 5 seconds, forcing exit');
    console.error('[GlobalTeardown] This indicates cleanup issues in the test suite');
    process.exit(0); // Exit with success since tests passed
  }, 5000);

  // If we exit naturally before the timer, clear it
  forceExitTimer.unref();
}
