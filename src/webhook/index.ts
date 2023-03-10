import Logger from 'bunyan';
import Kasumi from '../';
import express, { Express } from 'express';
import { WebHookConfig } from '../type';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { WebHook as WebHookType } from './type';

export default class WebHook {
    public logger: Logger;
    private client: Kasumi;
    private http: Express;
    private sn: number = 0;
    private messageBuffer: Array<Exclude<WebHookType.Events, WebHookType.ChallengeEvent>> = [];
    constructor(config: WebHookConfig, client: Kasumi) {
        this.client = client;
        this.logger = this.client.getLogger('webhook');
        this.http = express();
        this.http.use(bodyParser.json());
        this.http.post('/', (req, res) => {
            const body: { encrypt: string } = req.body;
            if (body.encrypt) {
                const base64Content = body.encrypt;
                const base64Decode = Buffer.from(base64Content, 'base64').toString('utf8');
                const iv = base64Decode.substring(0, 16);
                const encrypt = base64Decode.substring(16);
                const encryptKey = config.encryptKey.padEnd(32, '\0');
                const decipher = crypto.createDecipheriv('aes-256-cbc', encryptKey, iv);
                const decrypt = decipher.update(encrypt, 'base64', 'utf8') + decipher.final('utf8');
                try {
                    const event: WebHookType.Events = JSON.parse(decrypt);
                    if (event.d.verify_token == config.verifyToken) {
                        if (this.__isChallengeEvent(event)) {
                            res.send({
                                challenge: event.d.challenge
                            });
                        } else {
                            res.send();
                            this.logger.trace(`Recieved message "${event.d.content}" from ${event.d.author_id}, ID = ${event.d.msg_id}`, {
                                cur_sn: this.sn,
                                msg_sn: event.sn
                            });
                            this.messageBuffer.push(event);
                            this.messageBuffer.sort((a, b) => { return a.sn - b.sn });
                            while (this.messageBuffer[0] && this.messageBuffer[0].sn <= this.sn) this.messageBuffer.shift();
                            while (this.messageBuffer[0] && this.sn + 1 == this.messageBuffer[0].sn) {
                                let buffer = this.messageBuffer.shift();
                                if (buffer) {
                                    this.client.message.recievedMessage(buffer);
                                    this.sn = buffer.sn;
                                    if (this.sn >= 65536) this.sn = 0;
                                }
                                while (this.messageBuffer[0] && this.messageBuffer[0].sn < this.sn) this.messageBuffer.shift();
                            }
                            this.logger.trace(`${this.messageBuffer.length} more message(s) in buffer`);
                        }
                    } else {
                        this.logger.warn('Verify token dismatch!');
                        this.logger.warn(event);
                        res.status(401).send();
                    }
                } catch (e) {
                    res.status(500).send();
                    this.logger.error(e);
                }
            } else {
                this.logger.warn('Recieved unencrypted request')
                res.status(401).send();
            }
        })
        this.http.listen(config.port, () => {
            this.logger.debug(`WebHook HTTP server starts listening on port ${config.port}`);
        });
    }

    private __isChallengeEvent(event: WebHookType.Events): event is WebHookType.ChallengeEvent {
        return event.d.channel_type == 'WEBHOOK_CHALLENGE'
    }
}