// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export interface IMobileTarget {
    name?: string;
    id?: string;
    isOnline: boolean;
    isVirtualTarget: boolean;
}

export interface IDebuggableMobileTarget extends IMobileTarget {
    id: string;
}

export abstract class MobileTarget implements IDebuggableMobileTarget {
    protected _name?: string;
    protected _id: string;
    protected _isOnline: boolean;
    protected _isVirtualTarget: boolean;

    constructor(obj: IDebuggableMobileTarget) {
        this._isOnline = obj.isOnline;
        this._isVirtualTarget = obj.isVirtualTarget;
        this._id = obj.id;
        this._name = obj.name;
    }

    get name(): string {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
    }

    get id(): string {
        return this._id;
    }

    set id(id: string) {
        this._id = id;
    }

    get isOnline(): boolean {
        return this._isOnline;
    }

    set isOnline(value: boolean) {
        this._isOnline = value;
    }

    get isVirtualTarget(): boolean {
        return this._isVirtualTarget;
    }
}
