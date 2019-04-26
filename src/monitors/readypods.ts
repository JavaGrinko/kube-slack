import { EventEmitter } from "events";
import * as config from 'config';
import kube from '../kube';
import {
    KubernetesTriStateBoolean,
	NotifyMessage,
} from '../types';

class ReadyPods extends EventEmitter {
    maximumTime: number;
    alertedMap: Map<string, Date>;

    constructor() {
        super();
        this.maximumTime = parseInt(config.get('ready_max_time'), 10);
        this.alertedMap = new Map();
    }

    start() {
		setInterval(() => {
			this.check();
		}, parseInt(config.get('interval'), 10));
		return this;
    }
    async check() {
		let pods = await kube.getWatchedPods();

		for (let pod of pods) {
			let messageProps: Partial<NotifyMessage> = {};
			let annotations = pod.metadata.annotations;
			if (annotations) {
				// Ignore pod if the annotation is set and evaluates to true
				if (annotations['kube-slack/ignore-pod']) {
					continue;
				}

				if (annotations['kube-slack/slack-channel']) {
					messageProps.channel = annotations['kube-slack/slack-channel'];
				}
            }
            
            if (pod.metadata.name.startsWith('mine-web-ui') && pod.metadata.namespace === 'dev') {
                console.log(JSON.stringify(pod));
            }

			if (!pod.status || !pod.status.conditions) {
				continue;
			}

			let readyStatuses = pod.status.conditions.filter(
				item => {
                    let lastTransitionTime = new Date(<string>(item.lastTransitionTime)).getTime();
                    let duration = new Date().getTime()  - lastTransitionTime;
                    return item.type === 'Ready' && duration < this.maximumTime
                }
			);

			if (readyStatuses.length === 0) {
				continue;
            }

            let readyStatus = readyStatuses[0];

            if (readyStatus.status !== KubernetesTriStateBoolean.true) {
				continue;
			}

            let key = `${pod.metadata.namespace}/${pod.metadata.name}`;
            if (!this.alertedMap.has[key]) {
                this.alertedMap.set(key, new Date(<string>(readyStatus.lastTransitionTime)));
                this.emit('message', {
                    fallback: `Pod ${pod.metadata.namespace}/${
                        pod.metadata.name
                    } is ready: ${readyStatus.reason} - ${readyStatus.message}`,
                    color: 'good',
                    title: `${pod.metadata.namespace}/${
                        pod.metadata.name
                    }: ${readyStatus.reason || 'Pod is ready'}`,
                    text: readyStatus.message || 'Pod is ready',
                    ...messageProps,
                    _key: messageProps._key + 'recovery',
                } as NotifyMessage);
            }
            this.clearCache();
        }
    }

    clearCache() {
        let now = new Date().getTime();
        for (let [podName, date] of this.alertedMap) {
            if (now - date.getTime() > this.maximumTime) {
                this.alertedMap.delete(podName);
            }
        }
    }
}

export default () => new ReadyPods().start();