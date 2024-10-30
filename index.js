import Cache from "@actions/cache";
import ChildProcess from "child_process";
import Core from "@actions/core";
import {promises as FS} from "fs";
import IO from "@actions/io";
import OS from "os";
import {Octokit} from "@octokit/rest";
import Path from "path";
import ToolCache from "@actions/tool-cache";
import Util from "util";
import {cmpTags} from "tag-cmp";

// Polyfill __dirname:
import { fileURLToPath } from 'url';
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

const execFile = Util.promisify(ChildProcess.execFile);

const Linux = "Linux", Mac = "macOS", Windows = "Windows";

const sysPlatform = process.env["INSTALL_SFML_PLATFORM"] || process.platform;
const platform = {"linux": Linux, "darwin": Mac, "win32": Windows}[sysPlatform] || sysPlatform;

let sudo = function (command) {
    command.unshift("sudo", "-n");
    return command;
};

async function run() {
    if (platform === Windows || !await IO.which("sudo")) {
        sudo = (command) => command;
    }

    try {
        const params = {"sfml": "latest", "config": "Release"};
        for (const key of ["sfml", "config"]) {
            let value;
            if ((value = Core.getInput(key))) {
                params[key] = value;
            }
        }
        params.config = params.config.charAt(0).toUpperCase() + params.config.slice(1);

        if (params.sfml === Package && platform === Linux) {
            await installSfmlApt();
        } else if (params.sfml === Package && platform === Mac) {
            await installSfmlBrew();
        } else {
            await installSfmlFromSource(params);
        }
    } catch (error) {
        Core.setFailed(error);
        process.exit(1);
    }
}

const Latest = "latest";
const Nightly = "nightly";
const Package = "package";
const NumericVersion = /^[0-9]+(\.[0-9]+)+$/;
const NumericVersionSub = /(\b[0-9]+(\.[0-9]+)+(?=\W|_))/;

function checkVersion(what, version, allowed) {
    const numericVersion = NumericVersion.test(version) && version;
    allowed[allowed.indexOf(NumericVersion)] = numericVersion;

    if (allowed.includes(version)) {
        return version;
    }
    if ([Latest, Nightly, Package, numericVersion].includes(version)) {
        throw `Version "${version}" of ${what} is not supported on ${platform}`;
    }
    throw `Version "${version}" of ${what} is invalid`;
}

async function subprocess(command, options) {
    Core.info("[command]" + command.join(" "));
    const [file, ...args] = command;
    return execFile(file, args, options);
}

function addPath(key, ...items) {
    if (process.env[key]) {
        items.unshift(process.env[key]);
    }
    Core.exportVariable(key, items.join(Path.delimiter));
}

async function installSfmlApt() {
    await installAptPackages(["libsfml-dev", "xvfb"]);
    const {stdout} = await subprocess(["dpkg", "-s", "libsfml-dev"]);
    Core.setOutput("sfml", stdout.match(NumericVersionSub)[0]);
    Core.setOutput("path", "/usr");
}

async function installSfmlAptDeps({sfml}) {
    checkVersion("SFML", sfml, [NumericVersion]);
    const packages = [
        "libxrandr-dev", "libudev-dev", "libopenal-dev",
        "libgl1-mesa-dev", "libegl1-mesa-dev",
    ];
    if (cmpTags(sfml, "2.6") >= 0) {
        packages.push("libxcursor-dev");
    }
    if (cmpTags(sfml, "2.5") < 0) {
        packages.push("libjpeg-dev");
    }
    if (cmpTags(sfml, "2.4") < 0) {
        packages.push("freeglut3-dev", "libxcb-image0-dev");
    }
    packages.push("cmake", "xvfb");
    return installAptPackages(packages.sort());
}

async function installAptPackages(packages) {
    Core.info("Installing packages");
    try {
        await subprocess(sudo(["apt-get", "update"]));
    } catch (error) {}
    const {stdout} = await subprocess(sudo([
        "apt-get", "install", "-qy", "--no-install-recommends", "--no-upgrade", "--",
    ].concat(packages)));
    Core.startGroup("Finished installing packages");
    Core.info(stdout);
    Core.endGroup();
}

async function installSfmlBrew() {
    await installBrewPackages(["sfml"]);
    const {stdout} = await subprocess(["brew", "list", "sfml"]);
    const regex = new RegExp("^/[\\w/]+/sfml/" + NumericVersionSub.source + "[^/]*", "m");
    const [path, sfml] = stdout.match(regex);
    Core.setOutput("sfml", sfml);
    Core.setOutput("path", path);
}

async function installBrewPackages(packages) {
    Core.info("Installing packages");
    Core.exportVariable("HOMEBREW_NO_INSTALL_CLEANUP", "1");
    const {stdout} = await subprocess(["brew", "install"].concat(packages));
    Core.startGroup("Finished installing packages");
    Core.info(stdout);
    Core.endGroup();
}

async function installSfmlFromSource({sfml, config}) {
    checkVersion("SFML", sfml, [Latest, Nightly, NumericVersion]);

    let depsFunc = async () => {};
    if (platform === Linux) {
        depsFunc = installSfmlAptDeps;
    }
    const depsTask = depsFunc({sfml: (sfml === Nightly || sfml === Latest) ? "2.6.0" : sfml});

    const ref = await findRef({name: "SFML", version: sfml, repo: Repo});
    Core.setOutput("sfml", ref);
    const path = Path.join(process.env["RUNNER_TEMP"], `sfml-${sfml}-${config}`);
    const cacheKey = `install-sfml-v1-${ref}-${config}--${OS.arch()}-${OS.platform()}-${OS.release()}`;

    let restored = null;
    try {
        Core.info(`Trying to restore cache: key '${cacheKey}`);
        restored = await Cache.restoreCache([path], cacheKey);
    } catch (error) {
        Core.warning(error.message);
    }
    if (!restored) {
        Core.info(`Cache not found for key '${cacheKey}'`);
        await downloadSource({name: "SFML", ref, path, repo: Repo});
    }
    try {
        await FS.unlink(Path.join(path, "CMakeCache.txt"));
    } catch (error) {}

    await depsTask;
    if (platform !== Windows) {
        try {
            const {stdout} = await subprocess(["bash", Path.join(__dirname, "build-deps.sh"), Core.getInput("arch"), path], {cwd: __dirname});
            Core.info(stdout);
        } catch (error) {
            Core.info("build-deps.sh failed: " + error.toString());
        }
    }

    {
        const command = ["cmake", ".", "-DBUILD_SHARED_LIBS=ON"];
        if (platform !== Windows) {
            command.push(`-DCMAKE_BUILD_TYPE=${config}`);
        }
        command.push("-DFREETYPE_DIR=" + process.cwd());
        command.push("-DCMAKE_INSTALL_PREFIX=" + process.cwd());
        command.push("-DCMAKE_LIBRARY_PATH=" + Path.join(process.cwd(), 'lib'));
        command.push("-DCMAKE_PREFIX_PATH=" + Path.join(process.cwd(), 'include'));
        const {stdout} = await subprocess(command, {cwd: path});
        Core.startGroup("Finished configuring SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    const command = ["cmake", "--build", ".", "-j", "4"];
    {
        if (platform === Windows) {
            command.push("--config", config);
        }
        const {stdout} = await subprocess(command, {cwd: path});
        Core.startGroup("Finished building SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    {
        command.push("--target", "install");
        const {stdout} = await subprocess(sudo(command), {cwd: path});
        Core.startGroup("Finished installing SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    Core.setOutput("path", process.cwd());
    if (restored !== cacheKey) {
        Core.info(`Saving cache: '${cacheKey}'`);
        try {
            await Cache.saveCache([path], cacheKey);
        } catch (error) {
            Core.warning(error.message);
        }
    }
}

const Repo = {owner: "SFML", repo: "SFML"};

async function findRelease({name, repo, tag}) {
    Core.info(`Looking for latest ${name} release`);
    const releasesResp = await (tag
        ? github.rest.repos.getReleaseByTag({...repo, tag})
        : github.rest.repos.getLatestRelease(repo));
    const release = releasesResp.data;
    Core.info(`Found ${name} release ${release["html_url"]}`);
    return release;
}

async function findLatestCommit({name, repo, branch = "master"}) {
    Core.info(`Looking for latest ${name} commit`);
    const commitsResp = await github.rest.repos.getCommit({
        ...repo, "ref": branch,
    });
    const commit = commitsResp.data;
    Core.info(`Found ${name} commit ${commit["html_url"]}`);
    return commit["sha"];
}

async function findRef({name, repo, version}) {
    if (version === Nightly) {
        return findLatestCommit({name, repo});
    } else if (version === Latest) {
        const release = await findRelease({name, repo});
        return release["tag_name"];
    }
    return version;
}

async function downloadSource({name, repo, ref, path}) {
    Core.info(`Downloading ${name} source for ${ref}`);
    const resp = await github.rest.repos.downloadZipballArchive({
        ...repo, ref,
        request: {redirect: "manual"},
    });
    const url = resp.headers["location"];
    const downloadedPath = await ToolCache.downloadTool(url);
    Core.info(`Extracting ${name} source`);
    const extractedPath = await ToolCache.extractZip(downloadedPath);
    await IO.mv(await onlySubdir(extractedPath), path);
}

const github = new Octokit({auth: Core.getInput("token") || null});

async function onlySubdir(path) {
    const [subDir] = await FS.readdir(path);
    return Path.join(path, subDir);
}

run();
