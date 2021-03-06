import redent from 'redent';

import {
  Command,
  ImportStatement,
  List,
  Literal,
  Member,
  Root,
  Tree,
} from '../../src/schema/nodes';

describe('schema nodes', () => {
  describe('Root', () => {
    it('empty document serializes to empty string', () => {
      const root = new Root();
      expect(root.serialize()).toEqual('');
    });

    it('allows creating new interfaces', () => {
      const root = new Root();
      root.addInterface('DialArgs');
      expect(root.serialize()).toMatch('export interface DialArgs {}');
    });

    it('interface names must be unique', () => {
      const root = new Root();
      root.addInterface('DialArgs');
      expect(() => root.addInterface('DialArgs')).toThrow(
        /interface already exists/i,
      );
    });

    it('can only add a single Main class', () => {
      const root = new Root();
      root.addMain();
      expect(() => root.addMain()).toThrow(/main class already defined/i);
    });

    describe('getMain()', () => {
      it('throws with no main defined', () => {
        const root = new Root();
        expect(() => root.getMain()).toThrow(/no main class defined/i);
      });

      it('can get main class', () => {
        const root = new Root();
        const main = root.addMain();
        expect(root.getMain()).toEqual(main);
      });
    });

    describe('addGenericInterfaces', () => {
      it('adds generic interfaces', () => {
        const root = new Root();
        root.addGenericInterfaces();
        const serialized = root.serialize();
        expect(serialized).toMatch('export interface Gettable<T>');
        expect(serialized).toMatch('export interface Settable<T>');
        expect(serialized).toMatch('export interface Listenable<T>');
      });

      it('adds Configify type', () => {
        const root = new Root();
        root.addGenericInterfaces();
        expect(root.serialize()).toMatch('type Configify<T> =');
      });

      it('adds Statusify type', () => {
        const root = new Root();
        root.addGenericInterfaces();
        expect(root.serialize()).toMatch('type Statusify<T> =');
      });
    });

    it('can build entire module', () => {
      // .ts module
      const root = new Root('jsxapi');

      // Main XAPI class + generic interfaces
      const main = root.addMain();
      root.addGenericInterfaces();

      const commandTree = root.addInterface('CommandTree');
      main.addChild(new Member('Command', commandTree));

      const configTree = root.addInterface('ConfigTree');
      main.addChild(new Member('Config', configTree));

      const statusTree = root.addInterface('StatusTree');
      main.addChild(new Member('Status', statusTree));

      // XAPI command APIs
      const audio = commandTree.addChild(new Tree('Audio'));
      audio.addChild(new Tree('Microphones')).addChild(new Command('Mute'));
      const audioPlayArgs = root.addInterface('AudioPlayArgs');
      const soundLiteral = new Literal('Alert', 'Busy', 'CallInitiate');
      const onOffLiteral = new Literal('On', 'Off');
      audioPlayArgs.addChildren([
        new Member('Sound', soundLiteral),
        new Member('Loop', onOffLiteral, { required: false }),
      ]);
      audio
        .addChild(new Tree('Sound'))
        .addChild(new Command('Play', audioPlayArgs));
      const dialArgs = root.addInterface('DialArgs');
      dialArgs.addChild(new Member('Number', 'string'));
      commandTree.addChild(new Command('Dial', dialArgs));

      const resetArgs = root.addInterface('SystemUnitFactoryResetArgs');
      resetArgs.addChild(
        new Member('Confirm', 'Yes', { required: true }),
      );
      resetArgs.addChild(
        new Member(
          'Keep',
          new List(new Literal('LocalSetup', 'Network', 'Provisioning')),
          { required: false },
        ),
      );
      commandTree
        .addChild(new Tree('SystemUnit'))
        .addChild(new Command('FactoryReset', resetArgs));

      // XAPI config APIs
      configTree
        .addChild(new Tree('SystemUnit'))
        .addChild(new Member('Name', 'string'));

      // XAPI status APIs
      statusTree
        .addChild(new Tree('Audio'))
        .addChild(new Member('Volume', 'number'));

      // It dumps the shit
      expect(root.serialize()).toMatchSnapshot();
    });
  });

  describe('ImportStatement', () => {
    it('serializes import child', () => {
      const node = new ImportStatement('jsxapi', ['XAPI', 'connectGen']);
      expect(node.serialize()).toMatch('import { XAPI, connectGen } from "jsxapi";');
    });

    it('can customize module', () => {
      const node = new ImportStatement('../../xapi', ['TypedXAPI']);
      expect(node.serialize()).toMatch('import { TypedXAPI } from "../../xapi";');
    });
  });

  describe('MainClass', () => {
    it('extends base class', () => {
      const main = new Root().addMain();
      expect(main.serialize()).toMatch(
        'export class TypedXAPI extends XAPI {}',
      );
    });

    it('supports passing custom names', () => {
      const main = new Root().addMain('XapiWithTypes', { base: 'JSXAPI' });
      expect(main.serialize()).toMatch(
        'export class XapiWithTypes extends JSXAPI {}',
      );
    });

    it('exports as default', () => {
      const main = new Root().addMain();
      expect(main.serialize()).toMatch('export default TypedXAPI');
    });

    it('uses connectGen to export connect by default', () => {
      const root = new Root();
      root.addMain();
      const serialized = root.serialize();
      expect(serialized).toMatch(/import.*connect.*from.*jsxapi/);
      expect(serialized).toMatch('export const connect = connectGen(TypedXAPI);');
    });

    it('can skip generating connect export', () => {
      const root = new Root();
      root.addMain(undefined, { withConnect: false });
      const serialized = root.serialize();
      expect(serialized).not.toMatch(/import.*connect/);
      expect(serialized).not.toMatch(/export.*connect/);
    });

    it('exports an interface with name', () => {
      const main = new Root().addMain();
      expect(main.serialize()).toMatch('export interface TypedXAPI {}');
    });
  });

  describe('Interface', () => {
    it('can extend', () => {
      const root = new Root();
      root.addInterface('Gettable');
      const iface = root.addInterface('Config', ['Gettable']);
      expect(iface.serialize()).toMatch('export interface Config extends Gettable {}');
    });

    it('extending from an interface requires it to exist', () => {
      const root = new Root();
      expect(() => root.addInterface('Config', ['Gettable'])).toThrow(
        /cannot add interface Config.*missing interfaces: Gettable/i,
      );
    });

    it('can add command (function)', () => {
      const iface = new Root().addInterface('CommandTree');
      iface.addChild(new Command('Dial'));
      expect(iface.serialize()).toMatch(
        redent(`
        export interface CommandTree {
          Dial<R=any>(): Promise<R>;
        }
      `).trim(),
      );
    });

    it('can add tree', () => {
      const iface = new Root().addInterface('CommandTree');
      iface
        .addChild(new Tree('Audio'))
        .addChild(new Tree('Microphones'))
        .addChild(new Command('Mute'));
      expect(iface.serialize()).toMatch(
        redent(`
        export interface CommandTree {
          Audio: {
            Microphones: {
              Mute<R=any>(): Promise<R>,
            },
          };
        }
      `).trim(),
      );
    });
  });

  describe('List', () => {
    it('places literal in parentheses', () => {
      const literalArray = new List(new Literal('Foo', 'Bar', 'Baz'));
      expect(literalArray.getType()).toMatch("('Foo' | 'Bar' | 'Baz')[]");
    })
  });

  describe('Member', () => {
    it('quotes members with names containing special characters', () => {
      const option = new Member('Option.1', 'string');
      expect(option.serialize()).toMatch('"Option.1": string');
    });

    it('can add docstring', () => {
      const docstring = 'Define the default volume for the speakers.';
      const command = new Member('Microphones', 'number', { docstring });
      expect(command.serialize()).toMatch(docstring);
    });
  });

  describe('Tree', () => {
    it('renders levels of nesting', () => {
      const audio = new Tree('Audio');
      expect(audio.serialize()).toMatchSnapshot();

      const mic = audio.addChild(new Tree('Microphones'));
      expect(audio.serialize()).toMatchSnapshot();

      mic.addChild(new Member('LedIndicator', new Literal('On', 'Off')));
      expect(audio.serialize()).toMatchSnapshot();
    });
  });

  describe('Command', () => {
    it('can add docstring', () => {
      const command = new Command('Microphones', undefined, undefined, {
        docstring: 'Mute all microphones.',
      });
      expect(command.serialize()).toMatch('Mute all microphones.');
    });

    it('params arg optional if all members are optional (no body)', () => {
      const httpArgs = new Root().addInterface('HttpArgs');
      httpArgs.addChild(
        new Member('Url', 'string', { required: false }),
      );
      httpArgs.addChild(
        new Member('ResultBody', new Literal('None', 'PlainText'), { required: false }),
      );

      const getCmd = new Command('Get', httpArgs, undefined);
      expect(getCmd.serialize()).toMatch(/\(args\?: HttpArgs\)/);

      const postCmd = new Command('Post', httpArgs, undefined, {
        multiline: true,
      });
      expect(postCmd.serialize()).toMatch(/\(args: HttpArgs, body: string\)/);
    });

    it('can be multiline (without params)', () => {
      const command = new Command('Post', undefined, undefined, {
        multiline: true,
      });
      expect(command.serialize()).toMatch(/\(body: string\)/);
    });

    it('can be multiline (with params)', () => {
      const postArgs = new Root().addInterface('PostArgs');
      postArgs.addChild(
        new Member('Url', 'string', {
          required: true,
        }),
      );

      const command = new Command('Post', postArgs, undefined, {
        multiline: true,
      });
      expect(command.serialize()).toMatch(/\(args: PostArgs, body: string\)/);
    });
  });

  // There is no guarantee in xstatus that a node is present, so the result type
  // of a getting a status leaf or sub-tree should reflect this.
  it.todo('Status results should be optional/partial');
});
