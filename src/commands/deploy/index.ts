import {Flags} from '@oclif/core'
import {Blob} from 'node:buffer'
import {FormData, fetch} from 'undici'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {format} from "node:util";
import {safely} from "../../lib/utils.js";
import {BaseCommand} from "../../baseCommand.js";

export default class Deploy extends BaseCommand<typeof Deploy> {
    static description = 'Build the application'

    static flags = {
        projectDir: Flags.string({description: 'Relative path to project directory', required: true, default: '.'}),
        project: Flags.string({description: 'Project slug', required: true}),
        site: Flags.string({description: 'Site slug', required: true}),
        runtime: Flags.string({description: 'Runtime', required: true, default: 'nodejs20.x'}),
    }

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Deploy)

        if (!this.identity && !flags.inlineIdentityJson) {
            this.error('You are not logged in', {
                code: 'NOT_LOGGED_IN',
                suggestions: ['Run `tilda login` to login']
            })
        }
        if (!this.apiClient) {
            this.error('API client not initialized', {
                code: 'API_CLIENT_NOT_INITIALIZED',
                suggestions: ['Run `tilda login` to login. If the issue persists, please contact support.']
            })
        }

        const tildaBuildFilePath = path.resolve(flags.projectDir, '.tilda', 'package.zip');
        // check if build file exists
        const [errorWithCheckingBuildFileStats, buildFileStats] = await safely<Awaited<ReturnType<typeof fs.stat>>, {
            code: 'ENOENT',
            message: string
        }>(fs.stat(tildaBuildFilePath));
        if (errorWithCheckingBuildFileStats) {
            if (errorWithCheckingBuildFileStats.code !== 'ENOENT') {
                this.error(`Error checking build file: ${errorWithCheckingBuildFileStats.message}`);
            }
        } else if (!buildFileStats.isFile()) {
            this.error(`Build file is not a valid file: ${tildaBuildFilePath}`);
        }

        if (!buildFileStats) {
            this.error(`Build file does not exist: ${tildaBuildFilePath}`);
        }

        if (buildFileStats.size === 0) {
            this.error(`Build file is empty: ${tildaBuildFilePath}`);
        }

        const [errorWithPackageUrl, packageUploadUrlResponse] = await safely(this.apiClient.getComputeServicePackageUploadUrl.mutate({
            projectSlug: flags.project,
            serviceSlug: flags.site,
            runtime: flags.runtime,
            packageFileSizeBytes: 0,
        }));
        if (errorWithPackageUrl) {
            this.error(`Error getting package upload URL: ${errorWithPackageUrl.message}`);
        }

        this.debug('Got package upload params', packageUploadUrlResponse);

        const uploadData = new FormData();
        for (const [key, value] of Object.entries(packageUploadUrlResponse.params)) {
            uploadData.append(key, value);
        }

        const [errorWithReadingBuildFile, buildFileContents] = await safely(fs.readFile(tildaBuildFilePath));
        if (errorWithReadingBuildFile) {
            this.error(`Error reading build file: ${errorWithReadingBuildFile.message}`);
        }

        uploadData.append('file', new Blob([buildFileContents]));

        this.debug('Uploading package to', packageUploadUrlResponse.endpointUrl);
        const [uploadError, uploadResponse] = await safely(fetch(packageUploadUrlResponse.endpointUrl, {
            method: 'POST',
            body: uploadData,
        }));
        if (uploadError || !uploadResponse.ok) {
            console.error(uploadError, uploadResponse);
            this.error(`Error uploading package: ${uploadError?.message}`);
        }
        this.debug('Uploaded package', uploadResponse);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        this.debug('Creating version');
        const [errorWithCreatingVersion, versionResponseFeed] = await safely(this.apiClient.createComputeServiceVersion.mutate({
            projectId: packageUploadUrlResponse.projectId,
            serviceId: packageUploadUrlResponse.serviceId,
            uploadToken: packageUploadUrlResponse.uploadToken,
            runtime: flags.runtime,
        }));
        if (errorWithCreatingVersion) {
            this.error(`Error creating version: ${errorWithCreatingVersion.message}`);
        }

        for await (const chunk of versionResponseFeed) {
            this.log(format(chunk));
        }
    }
}
