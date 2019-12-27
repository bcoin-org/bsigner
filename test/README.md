Tests
====

These are integration tests, that require device to be available and be
preconfigured. Devices are expected to be initialized with
seed:

```
 1. abandon
 2. abandon
 3. abandon
 4. abandon
 5. abandon
 6. abandon
 7. abandon
 8. abandon
 9. abandon
10. abandon
11. abandon
12. about
```

Other than `getPublicKey` tests, everything else verify that device has been
initialized with this specific seed.
Device selector currently does not accept selection from multiple same type
devices, so make sure only test device is connected. (otherwise it will select
first device)

## Running tests for specific vendor

Test suite will try to run tests against all available devices.
if you want to restrict to specific vendors, you can use `TEST_VENDORS` env
variable, e.g.: `TEST_VENDORS="ledger" bmocha ./test/getPublicKey-test.js`

Examples:
```
TEST_VENDORS="any" - default, any available device
TEST_VENDORS="ledger" - specific vendor
TEST_VENDORS="trezor,ledger" - specific vendors
TEST_VENDORS="trezor,ledger,..." - specific vendors
```
