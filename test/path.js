/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');

const {Path} = require('../lib/path');
const {bip44} = require('../lib/common');
const {testxpub} = require('./utils/key');

describe('Path', function () {
  let path;

  beforeEach(() => {
    path = null;
  });

  it('should instantiate from index', () => {
    // path knows nothing about coin type
    // or purpose, assumes bip 44/bitcoin mainnet
    // when fromIndex

    const index = 0;
    path = Path.fromIndex(index);
    assert.ok(path);

    const str = path.toString();
    // m'/44'/0'/0'
    // bip44 account xpub
    assert.equal('m\'/44\'/0\'/0\'', str);

    const list = path.toList();

    const expected = [
      Path.harden(44),     // purpose
      Path.harden(0),      // type
      Path.harden(index)   // account index
    ];

    for (const [i, uint] of Object.entries(list))
      assert.equal(uint, expected[i]);
  });

  it('should instantiate from list', () => {
    const input = [0,0,0];
    path = Path.fromList(input);
    assert.ok(path);

    const str = path.toString();
    assert.equal('m\'/0/0/0', str);

    const list = path.toList();
    assert.deepEqual(input, list);
  });

  it('should instantiate from hardened list', () => {
    const input = [0,0,0];
    path = Path.fromList(input, true);

    const str = path.toString();
    assert.equal('m\'/0\'/0\'/0\'', str);

    const list = path.toList();
    const expected = [
      Path.harden(0),
      Path.harden(0),
      Path.harden(0)
    ];

    assert.deepEqual(list, expected);
  });

  it('should instantiate from string', () => {
    const input = 'm\'/0/0/0';
    path = Path.fromString(input);
    assert.ok(path);

    const str = path.toString();
    assert.equal(input, str);

    const list = path.toList();
    assert.deepEqual(list, [0,0,0]);
  });

  it('should work up to 255 depth', () => {
    const input = [];
    for (let i = 0; i < 255; i++)
      input.push(i);

    path = Path.fromList(input);
    assert.ok(path);

    const list = path.toList();
    assert.deepEqual(list, input);

    // note: this only works because each number
    // is less than 255, so we don't need to harden
    // any of the integers
    const expected = 'm\'/' + input.join('/');
    const str = path.toString();
    assert.equal(str, expected);
  });

  it('should properly convert hardened string', () => {
    const purpose = 44;
    const type = 5353; // hns :)
    const index = 12;
    const input = `m'/${purpose}'/${type}'/${index}'`;

    path = Path.fromString(input);

    const list = path.toList();

    const expected = [
      Path.harden(purpose),
      Path.harden(type),
      Path.harden(index)
    ];

    assert.deepEqual(list, expected);
  });

  it('should properly convert non hardened string', () => {
    const depthOne = 72;
    const depthTwo = 32;
    const depthThree = 91;
    const input = `m'/${depthOne}/${depthTwo}/${depthThree}`;

    path = Path.fromString(input);

    const list = path.toList();
    assert.deepEqual(list, [depthOne, depthTwo, depthThree]);
  });

  it('should properly convert to hardened string', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      Path.harden(purpose),
      Path.harden(type),
      Path.harden(index)
    ];

    path = Path.fromList(input);

    const str = path.toString();
    const expected = `m'/${purpose}'/${type}'/${index}'`;

    assert.equal(str, expected);
  });

  it('should instantiate from xpub', () => {
    const xpub = testxpub(0, 'regtest');
    const accountKey = xpub.xpubkey('regtest');
    path = Path.fromAccountPublicKey(accountKey);
    assert.ok(path);
  });

  it('should work from xpub for each network', () => {
    const networks = ['main', 'testnet', 'regtest', 'simnet'];

    const index = 10;

    // indexed by network
    const strings = [
      `m'/44'/0'/${index}'`,
      `m'/44'/1'/${index}'`,
      `m'/44'/1'/${index}'`,
      `m'/44'/1'/${index}'`
    ];

    for (const [i, network] of Object.entries(networks)) {
      const xpub = testxpub(index, network);
      const accountKey = xpub.xpubkey(network);
      path = Path.fromAccountPublicKey(accountKey);

      const str = path.toString();
      assert.equal(str, strings[i]);

      const expected = [
        Path.harden(44),
        Path.harden(bip44.coinType[network]),
        Path.harden(index)
      ];

      const list = path.toList();
      assert.deepEqual(list, expected);
    }
  });

  it('should throw an error for bad xpub prefix', () => {
    const xpub = testxpub(0, 'regtest');
    let accountKey = xpub.xpubkey('regtest');
    // replace first character with a
    accountKey = 'a' + accountKey.slice(1);

    let err;
    try {
      path = Path.fromAccountPublicKey(accountKey);
    } catch(e) {
      err = true;
    }

    assert.ok(err);
  });

  it('should append hardened', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      Path.harden(purpose),
      Path.harden(type),
      Path.harden(index)
    ];

    path = Path.fromList(input);

    const str = path.toString();
    const expected = `m'/${purpose}'/${type}'/${index}'`;

    assert.equal(str, expected);
  });

  it('should append non hardened', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      purpose,
      type,
      index
    ];

    path = Path.fromList(input);

    {
      const list = path.toList();
      assert.deepEqual(input, list);
    }

    {
      const next = 0;
      path = path.push(next);
      const expected = [...input, next];
      const list = path.toList();
      assert.deepEqual(list, expected);

      const str = path.toString();

      assert.equal(str, `m'/${purpose}/${type}/${index}/${next}`);
    }
  });

  it('should append multiple in a row', () => {
    const purpose = 84;
    const type = 1;
    const index = 0;

    const input = [
      purpose,
      type,
      index
    ];

    path = Path.fromList(input);

    const one = 10;
    const two = 54;

    path = path.push(one).push(two);

    const expected = [...input, one, two];
    const list = path.toList();
    assert.deepEqual(list, expected);

    const str = path.toString();

    assert.equal(str, `m'/${purpose}/${type}/${index}/${one}/${two}`);
  });

  it('should append hardened', () => {
    const purpose = 45;

    const input = [purpose];

    path = Path.fromList(input);

    const one = 0;
    const two = 10;
    path = path.push(one, true).push(two, true);

    const str = path.toString();
    {
      const expected = `m'/${purpose}/${one}'/${two}'`;
      assert.equal(str, expected);
    }

    const list = path.toList();
    {
      const expected = [
        ...input,
        Path.harden(one),
        Path.harden(two)
      ];

      assert.deepEqual(list, expected);
    }
  });

  it('should fail to append when too long', () => {
    const list = [0,0,0,0,0];
    path = Path.fromList(list);
    let err;
    try {
      path.push(0);
    } catch(e) {
      err = true;
    }

    assert.ok(err);
  });

  it('should append in non strict mode', () => {
    path = Path.fromOptions({
      purpose: Path.harden(44),
      coin: Path.harden(0),
      account: Path.harden(0),
      strict: false
    });
    for (let i = 0; i < 5; i++)
      path = path.push(0);

    assert.ok(path);
  });

  it('should instantiate from options object', () => {
    const purpose = 44;
    const coin = 105;
    const account = 0;

    path = Path.fromOptions({
      purpose: {index: purpose, hardened: true},
      coin: {index: coin, hardened: true},
      account: {index: account, hardened: true}
    });

    assert.equal(path.purpose, Path.harden(purpose));
    assert.equal(path.coin, Path.harden(coin));
    assert.equal(path.account, Path.harden(account));
  });

  it('should instantiate from mixed options object', () => {
    const purpose = 999;
    const coin = 0;
    const account = 14;

    path = Path.fromOptions({
      purpose: {index: purpose, hardened: false},
      coin: {index: coin},
      account: {index: account, hardened: true}
    });

    assert.equal(path.purpose, purpose);
    assert.equal(path.coin, coin);
    assert.equal(path.account, Path.harden(account));

    const list = path.toList();
    assert.deepEqual(list, [
      purpose,
      coin,
      Path.harden(account)
    ]);
  });

  it('should instantiate from options with alt hardened syntax', () => {
    const purpose = '12h';
    const coin = '14';
    const account = '1\'';

    path = Path.fromOptions({
      purpose: purpose,
      coin: coin,
      account: account
    });

    assert.equal(path.purpose, Path.harden(12));
    assert.equal(path.coin, 14);
    assert.equal(path.account, Path.harden(1));
  });

  /*
   * NOTE: bcoin doesn't currently use ypub and zpub
   */
  it('should dynamically update purpose', () => {
    const accountIndex = Path.harden(0);
    const xpub = testxpub(accountIndex, 'regtest');

    const newPurpose = Path.harden(48);

    path = Path.fromAccountPublicKey(xpub.xpubkey('regtest'));
    path.purpose = newPurpose;

    assert.equal(path.purpose, newPurpose);

    const list = path.toList();
    assert.equal(list[0], newPurpose);

    const str = path.toString();
    assert.equal(str, 'm\'/48\'/1\'/0\'');
  });

  it('should dynamically update coin type', () => {
    const purpose = '47h';
    const coin = '5353h';
    const account = '0h';

    path = Path.fromOptions({
      purpose,
      coin,
      account
    });

    const str1 = path.toString();
    const list1 = path.toList();

    assert.equal(str1, 'm\'/47\'/5353\'/0\'');
    assert.deepEqual(list1, [
      Path.harden(47),
      Path.harden(5353),
      Path.harden(0)
    ]);

    path.coin = '0h';
    const str2 = path.toString();
    const list2 = path.toList();

    assert.equal(str2, 'm\'/47\'/0\'/0\'');
    assert.deepEqual(list2, [
      Path.harden(47),
      Path.harden(0),
      Path.harden(0)
    ]);

    path.coin = 10;
    const str3 = path.toString();
    const list3 = path.toList();

    assert.equal(str3, 'm\'/47\'/10/0\'');
    assert.deepEqual(list3, [
      Path.harden(47),
      10,
      Path.harden(0)
    ]);
  });
});
