// Type definitions for phonegap-plugin-barscodescanner
// Project: https://github.com/phonegap/phonegap-plugin-barcodescanner
// Definitions by: Microsoft

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

interface cordova {
    plugins: CordovaPlugins;
}

interface CordovaPlugins {
    /**
     * This plugin provides an API for scanning and encoding barcodes.
     */
    barcodeScanner: PhonegapBarcodeScanner;
}

/**
 * Success result object type.
 */
interface PhonegapBarcodeScannerSuccessResult {
    text: string,
    format: string,
    cancelled: boolean
}

/**
 * This plugin provides an API for scanning and encoding barcodes.
 */
interface PhonegapBarcodeScanner {
    /**
     * Encoding constants.
     */
    Encode: {
        TEXT_TYPE: number,
        EMAIL_TYPE: number,
        PHONE_TYPE: number,
        SMS_TYPE: number
    };

    /**
     * Barcode format constants, defined in ZXing library.
     */
    format: {
        "all_1D": number,
        "aztec": number,
        "codabar": number,
        "code_128": number,
        "code_39": number,
        "code_93": number,
        "data_MATRIX": number,
        "ean_13": number,
        "ean_8": number,
        "itf": number,
        "maxicode": number,
        "msi": number,
        "pdf_417": number,
        "plessey": number,
        "qr_CODE": number,
        "rss_14": number,
        "rss_EXPANDED": number,
        "upc_A": number,
        "upc_E": number,
        "upc_EAN_EXTENSION": number
    };

    /**
     * Read code from scanner.
     *
     * @param {onSuccess} successCallback This function will recieve a result object: {
     *        text : '12345-mock',    // The code.
     *        format : 'FORMAT_NAME', // Code format.
     *        cancelled : true/false, // Was canceled.
     *    }
     * @param {onError} errorCallback
     */
    scan(
        onSuccess: (result: PhonegapBarcodeScannerSuccessResult) => void,
        onError: (error: any) => void);

    /**
     * Encodes the given data.
     *
     * @param {type} The type of the data to be encoded
     * @param {data} The data to be encoded
     * @param {onSuccess} successCallback This function will recieve a result object: {
     *        text : '12345-mock',    // The code.
     *        format : 'FORMAT_NAME', // Code format.
     *        cancelled : true/false, // Was canceled.
     *    }
     * @param {onError} errorCallback
     */
    encode(
        type: number,
        data: string,
        onSuccess: (result: PhonegapBarcodeScannerSuccessResult) => void,
        onError: (error: any) => void);
}