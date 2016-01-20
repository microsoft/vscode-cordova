
declare module "tsd" {
    export class API {
        context: Context;
        constructor(context: Context);
        initConfig(overwrite: boolean): Promise<string[]>;
        readConfig(optional: boolean): Promise<void>;
        saveConfig(): Promise<string>;
        select(query: Query, options?: Options): Promise<any>;
        install(selection: any, options?: Options): Promise<InstallResult>;
        reinstall(options?: Options): Promise<InstallResult>;
        update(options?: Options, version?: string): Promise<any>;
    }

    export class Context {
        verbose: boolean;
        paths: any;
        config: any;
        packageInfo: any;
        settings: any;
        constructor(configFile?: string, verbose?: boolean);
        stackSettings(src: string): void;
        getTypingsDir(): string;
        getInfo(details?: boolean): Object;
    }

    interface IKeyValuePair<T> {
        [key: string]: T;
    }
    
    export class Hash {
        dict: IKeyValuePair<string[]>;
    }
    
    export class InstallResult {
        written: Hash;
        removed: Hash;
        skipped: Hash;
        constructor(configFile?: string, verbose?: boolean);
    }
    
    export class Selection {
        query: Query;
        constructor(query: Query);
    }
    
    export class Options {
        minMatches: number;
        maxMatches: number;
        limitApi: number;
        resolveDependencies: boolean;
        overwriteFiles: boolean;
        saveToConfig: boolean;
        saveBundle: boolean;
        reinstallClean: boolean;
        addToBundles: string[];
        static fromJSON(json: Object): Options;
        static main: Options;
    }
    
    export class Def {
        path: string;
        project: string;
        name: string;
        semver: string;
        label: string;
        isLegacy: boolean;
        isMain: boolean;
        head: any;
        history: any[];
        releases: Def[];
        constructor(path: string);
        toString(): string;
        pathTerm: string;
        nameTerm: string;
        static isDefPath(path: string): boolean;
        static getFrom(path: string): Def;
    }

    export class VersionMatcher {
        static latest: string;
        static all: string;
        range: string;
        constructor(range?: string);
        filter(list: Def[]): Def[];
        private getLatest(list);
    }

    export class Query {
        patterns: any[];
        versionMatcher: VersionMatcher;
        parseInfo: boolean;
        loadHistory: boolean;
        constructor(pattern?: string);
        addNamePattern(pattern: string): void;
        setVersionRange(range: string): void;
        requiresHistory: boolean;
        toString(): string;
    }

    export function getAPI(configPath: string, verbose?: boolean): API;
}
