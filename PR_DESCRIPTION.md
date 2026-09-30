## Summary

This PR fixes the CI pipeline build failure caused by the removal of the `critters` dependency during cleanup.

## Problem

The CI pipeline was failing with "Cannot find module 'critters'" error. During the cleanup process, the `critters` dependency was incorrectly removed from `package.json`, but it's a required dependency for Next.js CSS optimization during the build process.

## Solution

Restored the `critters` dependency in `package.json` with version `^0.0.24`.

## Verification

- Confirmed that `npm run build` now succeeds
- Verified full CI pipeline (`npm run ci`) passes
- Tested that the development server runs correctly

## Files Changed

- `package.json`: Added back `critters` dependency