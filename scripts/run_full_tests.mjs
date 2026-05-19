import { createVitest, parseCLI } from 'vitest/node';

const { filter, options } = parseCLI(['vitest', 'run', ...process.argv.slice(2)]);

options.run = true;
options.watch = false;

let vitest;

try {
  vitest = await createVitest('test', options);

  const result = await vitest.start(filter);
  const passed = result.unhandledErrors.length === 0 && result.testModules.every(testModule => testModule.ok());

  process.exitCode = passed ? 0 : 1;
}
catch (error) {
  process.exitCode = 1;
  console.error(error);
}
finally {
  if (vitest) {
    try {
      await vitest.exit(true);
    }
    catch (error) {
      process.exitCode = 1;
      console.error(error);
    }
  }
}
