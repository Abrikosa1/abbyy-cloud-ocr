import {AbbyyOcr, ProcessingSettings} from './src/index';
import {program} from 'commander';

const process = require('process');
const dotenv = require('dotenv');
const Gauge = require('gauge');

(async () => {

  type OptionsType = {
    appId: string,
    password: string,
    serviceUrl: string,
    language? : string,
    exportFormat?: string,
    customOptions?: string
    outputPath?: string,
    filenames?: boolean,
    finished?: boolean,
    summary?: boolean
  };

  // process
  program
    .command("process <files...>")
    .description("Process the given files and download the results")
    .option("-l, --language <language>", "Recognition language or comma-separated list of languages, defaults to \"English\"")
    .option("-e, --export-format <format>", "Output format. One of: txt (default), txtUnstructured, rtf, docx, xlsx, pptx, pdfa, pdfSearchable, pdfTextAndImages, xml")
    .option("-c, --custom-options <options>", "Other custom options passed to REST-ful call,  like 'profile=documentArchiving'")
    .option("-o, --output-path <path>", "The path to which to save the processed files")
    .option("-F, --filenames", "Output the filenames of the processed and downloaded files")
    // .action(processFiles);

  // list
  program
    .command("list")
    .description("List ongoing or finished tasks.")
    .option("-S, --summary", "Return a summary (count) of current statuses.")
    .option("-f, --finished", "Only list finished tasks")
    .action(list);

  // info
  program.command("info").action(info)

  // general options
  program
    .option("-u, --service-url <url>", "The http endpoint of the Cloud OCR Service")
    .option("-i, --app-id <id>", "The id of the application")
    .option("-P, --password <password>", "The application password")

  // parse and start caommand!
  await program.parseAsync();

  /**
   * Sets up and returns the OCR client
   * @return {AbbyyOcr}
   */
  function createClient(options: OptionsType) : AbbyyOcr{
    // load environment variables from config file, if it exists, and add missing config. CLI params take precedence
    dotenv.config();
    options.serviceUrl = options.serviceUrl || process.env.ABBYY_SERVICE_URL;
    options.appId = options.appId || process.env.ABBYY_APP_ID;
    options.password = options.password || process.env.ABBYY_APP_PASSWD;
    return new AbbyyOcr(options.appId, options.password, options.serviceUrl);
  }

  /**
   * Processes the files that are provided on the command line
   * @param files
   * @param options
   */
  // async function processFiles(files : string[], options: OptionsType) : Promise<void>{
  //   const ocr = createClient(options);
  //   const settings = new ProcessingSettings(options.language, options.exportFormat, options.customOptions);
  //   for (let filePath of files) {
  //     options.filenames || console.log("Processing " + filePath);
  //     await ocr.process(filePath, settings);
  //     for await (const processedFilePath of ocr.downloadResult(options.outputPath) ) {
  //       console.info( (options.filenames ? "" : "Downloaded ") + processedFilePath);
  //     }
  //   }
  // }

  /**
   * List ongoing and/or completed tasks
   * @param {OptionsType} options
   */
  async function list(options: OptionsType) {
    const ocr = createClient(options);
    const {tasks} = await (options.finished ? ocr.listFinishedTasks() : ocr.listTasks());
    let result = tasks;
    if (options.summary) {
      result = tasks.reduce((s : any, t) => {
        s[t.status] = s[t.status] ? s[t.status]+1 : 1
        return s;
      }, {});
    }
    console.log(JSON.stringify(result,null, 2));
  }

  /**
   * Output information on the current application
   * @param {OptionsType} options
   */
  async function info(options: OptionsType) {
    const ocr = createClient(options);
    const result = await ocr.getApplicationInfo();
    console.log(JSON.stringify(result,null, 2));
  }

})().catch(err => {
  console.log(err)
  process.exit(1)
})
