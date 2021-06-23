"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbbyyOcr = exports.ProcessingSettings = void 0;
const events_1 = require("events");
const path = require("path");
const os_1 = require("os");
const querystring = require("querystring");
const { Ocrsdk, ProcessingSettings, TaskData } = require('./ocrsdk.js');
exports.ProcessingSettings = ProcessingSettings;
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const fetch = require('node-fetch');
var HTTP_VERBS;
(function (HTTP_VERBS) {
    HTTP_VERBS["GET"] = "get";
    HTTP_VERBS["POST"] = "post";
})(HTTP_VERBS || (HTTP_VERBS = {}));
/**
 * The Abbyy Cloud OCR client class
 */
class AbbyyOcr {
    /**
     * Constructor
     * @param appId
     * @param password
     * @param serviceUrl
     * @param settings
     */
    constructor(appId, password, serviceUrl) {
        if (!appId || !password || !serviceUrl) {
            throw new Error("Incomplete parameters");
        }
        this.ocrsdk = new Ocrsdk(appId, password, serviceUrl);
        this.appId = appId;
        this.password = password;
        this.serviceUrl = serviceUrl;
        this.emitter = new events_1.EventEmitter;
        this.downloadUrls = [];
        this.fileName = "";
    }
    /**
     * Call the Abbyy Cloud OCR V2 web API
     * @param verb
     * @param methodName
     * @param params
     * @param body
     * @private
     */
    async callService(verb, methodName, params = {}, body) {
        let url = `${this.serviceUrl}/v2/${methodName}?${querystring.stringify(params)}`;
        const auth = Buffer.from(this.appId + ":" + this.password, 'utf-8').toString('base64');
        const options = {
            method: verb,
            headers: { "Authorization": `Basic ${auth}` },
            body
        };
        let response;
        try {
            response = await fetch(url, options);
            return await response.json();
        }
        catch (e) {
            // see https://support.abbyy.com/hc/en-us/articles/360017326719-HTTP-status-codes-and-response-formats
            if (e.error !== undefined) {
                throw e.error;
            }
            throw new Error(`${response.status} ${response.statusText} @ ${response.url}`);
        }
    }
    /**
     * Register an event handler
     * @param event
     * @param handler
     */
    on(event, handler) {
        this.emitter.on(event, handler);
    }
    /**
     * Uploads a document to the Abbyy OCR service and processes them.
     * @param {String | Buffer} filePath
     */
    async process(filePath, settings) {
        this.settings = new ProcessingSettings();   
        // this.fileName = path.basename(filePath);
        
        // this.emitter.emit(AbbyyOcr.event.uploading, this.fileName);
        let taskData = await new Promise(((resolve, reject) => {
            this.ocrsdk.processImage(filePath, this.settings, (error, taskData) => {
                if (error) {
                    reject(error);
                }
                else if (!this.ocrsdk.isTaskActive(taskData)) {
                    reject(new Error("Unexpected task status " + taskData.status));
                }
                resolve(taskData);
            });
        }));
        // this.emitter.emit(AbbyyOcr.event.processing, this.fileName);
        taskData = await new Promise(((resolve, reject) => {
            this.ocrsdk.waitForCompletion(taskData.id, (error, taskData) => {
                if (error) {
                    reject(error);
                }
                else if (taskData.status.toString() !== 'Completed') {
                    reject(taskData.error);
                }
                else {
                    resolve(taskData);
                }
            });
        }));
        let urls = [];
        for (let resultId of ["resultUrl", "resultUrl2", "resultUrl3"]) {
            if (taskData[resultId]) {
                urls.push(taskData[resultId].toString());
            }
        }
        this.downloadUrls = urls;
        return urls;
    }
    /**
     * @see https://support.abbyy.com/hc/en-us/articles/360017326679-listTasks-Method
     */
    async listTasks() {
        return await this.callService(HTTP_VERBS.GET, "listTasks");
    }
    /**
     * @see https://support.abbyy.com/hc/en-us/articles/360017269900-listFinishedTasks-Method
     */
    async listFinishedTasks() {
        return await this.callService(HTTP_VERBS.GET, "listFinishedTasks");
    }
    /**
     * @see https://support.abbyy.com/hc/en-us/articles/360017269860-getTaskStatus-Method
     * @param {string} taskId
     */
    async getTaskStatus(taskId) {
        return await this.callService(HTTP_VERBS.GET, "getTaskStatus", { taskId });
    }
    /**
     * @see https://support.abbyy.com/hc/en-us/articles/360017326699-getApplicationInfo-Method
     */
    async getApplicationInfo() {
        return await this.callService(HTTP_VERBS.GET, "getApplicationInfo");
    }
    /**
     * Returns an async generator that can be used in a `for await ()` loop that will iterate
     * as long as there are files to download. Each iteration of the loop downloads one file
     * and returns the path to it.
     * @param {String?} targetDir Optional directory to which to download the file. If not given,
     * a temporary directory is used
     * @returns {AsyncGenerator<string>}
     */
    async *downloadResult(targetDir) {
        targetDir = targetDir || os_1.tmpdir();
        const extensions = this.settings.exportFormat.split(",").map((format) => {
            const ext = format.slice(0, 3);
            return ["pdf", "txt"].includes(ext) ? format + "." + ext : format;
        });
        for (let url of this.downloadUrls) {
            const response = await fetch(url);
            if (!response.ok)
                throw new Error(`Unexpected response ${response.statusText}`);
            const fileName = this.fileName.split(".").slice(0, -1).concat([extensions.shift()]).join(".");
            const targetPath = path.join(targetDir, fileName);
            this.emitter.emit(AbbyyOcr.event.downloading, fileName);
            await streamPipeline(response.body, createWriteStream(targetPath));
            yield targetPath;
        }
    }
}
exports.AbbyyOcr = AbbyyOcr;
/**
 * The events emitted by this class
 */
AbbyyOcr.event = {
    uploading: 'AbbyyOcr.event.uploading',
    processing: 'AbbyyOcr.event.processing',
    downloading: 'AbbyyOcr.event.downloading'
};
