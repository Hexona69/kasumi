import Rest from "../../requestor";
import { RawAssetCreateResponse } from "./type";
import FormData from "form-data";

export default class Asset {
    private rest: Rest;
    constructor(rest: Rest) {
        this.rest = rest;
    }
    async create(buffer: Buffer, config?: FormData.AppendOptions): Promise<RawAssetCreateResponse | undefined> {
        const form = new FormData();
        form.append('file', buffer, {
            filename: 'image.png',
            ...config
        })
        return await this.rest.post('/asset/create', form, {
            headers: form.getHeaders()
        }).catch((e) => {
            this.rest.logger.error(e);
            return undefined;
        })
    }
}