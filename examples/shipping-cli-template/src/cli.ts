#!/usr/bin/env node
import { program } from 'commander';

program
  .name('shipping-template')
  .description('CLI from Umbrella shipping template')
  .version('0.1.0')
  .option('-v, --verbose', 'extra logging')
  .action((opts: { verbose?: boolean }) => {
    if (opts.verbose) {
      console.log('verbose: on');
    }
    console.log('shipping-template: ok');
  });

program.parse();
