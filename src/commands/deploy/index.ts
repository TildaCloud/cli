import {Flags} from '@oclif/core'
import {Blob} from 'node:buffer'
import {FormData, fetch} from 'undici'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {safely} from "../../lib/utils.js";
import {BaseCommand} from "../../baseCommand.js";

export default class Deploy extends BaseCommand<typeof Deploy> {
    static description = 'Build the application'

    static flags = {
        projectDir: Flags.string({description: 'Relative path project directory', required: true}),
        projectSlug: Flags.string({description: 'Project slug', required: true}),
        serviceSlug: Flags.string({description: 'Service slug', required: true}),
        runtime: Flags.string({description: 'Runtime', required: true}),
    }

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Deploy)

        if (!this.identity) {
            this.error('You are not logged in', {
                code: 'NOT_LOGGED_IN',
            })
        }
        if (!this.apiClient) {
            this.error('API client not initialized', {
                code: 'API_CLIENT_NOT_INITIALIZED'
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
            projectSlug: flags.projectSlug,
            serviceSlug: flags.serviceSlug,
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

        this.debug('Creating version');
        const [errorWithCreatingVersion, versionResponse] = await safely(this.apiClient.createComputeServiceVersion.mutate({
            projectId: packageUploadUrlResponse.projectId,
            serviceId: packageUploadUrlResponse.serviceId,
            uploadToken: packageUploadUrlResponse.uploadToken,
            runtime: flags.runtime,
        }));
        if (errorWithCreatingVersion) {
            this.error(`Error creating version: ${errorWithCreatingVersion.message}`);
        }

        this.debug('Created version', versionResponse);
        const deployedHostnames = versionResponse?.routingConfig?.hostnames?.map((h: string) => `https://${h}/`)
        this.log('Deployed version', deployedHostnames);
    }
}
