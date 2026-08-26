(() => {
if (globalThis.__cardMasterCatCatchChrome) {
    return;
}

const cardMasterNativeChrome = globalThis.chrome;
const cardMasterCatCatchStoragePrefix = 'card-master.cat-catch.';
const cardMasterCatCatchDnrPriority = 920372;

function cardMasterCatCatchStorageKey(key) {
    return `${cardMasterCatCatchStoragePrefix}${key}`;
}

function cardMasterCatCatchStorageQuery(keys) {
    if (keys == null) {
        return null;
    }
    if (typeof keys === 'string') {
        return cardMasterCatCatchStorageKey(keys);
    }
    if (Array.isArray(keys)) {
        return keys.map(cardMasterCatCatchStorageKey);
    }
    return Object.fromEntries(
        Object.entries(keys).map(([key, value]) => [
            cardMasterCatCatchStorageKey(key),
            value
        ])
    );
}

function cardMasterCatCatchStorageResult(result) {
    return Object.fromEntries(
        Object.entries(result)
            .filter(([key]) => key.startsWith(cardMasterCatCatchStoragePrefix))
            .map(([key, value]) => [
                key.slice(cardMasterCatCatchStoragePrefix.length),
                value
            ])
    );
}

function cardMasterCatCatchStorageArea(area) {
    return {
        get(keys, callback) {
            const query = cardMasterCatCatchStorageQuery(keys);
            if (callback) {
                return area.get(query, (result) =>
                    callback(cardMasterCatCatchStorageResult(result))
                );
            }
            return area.get(query).then(cardMasterCatCatchStorageResult);
        },
        set(values, callback) {
            const next = Object.fromEntries(
                Object.entries(values).map(([key, value]) => [
                    cardMasterCatCatchStorageKey(key),
                    value
                ])
            );
            return callback ? area.set(next, callback) : area.set(next);
        },
        clear(callback) {
            const operation = area.get(null).then((result) => {
                const keys = Object.keys(result).filter((key) =>
                    key.startsWith(cardMasterCatCatchStoragePrefix)
                );
                return keys.length > 0 ? area.remove(keys) : undefined;
            });
            if (callback) {
                operation.then(() => callback());
                return;
            }
            return operation;
        }
    };
}

const cardMasterCatCatchStorageListeners = new WeakMap();
const cardMasterCatCatchStorage = {
    local: cardMasterCatCatchStorageArea(cardMasterNativeChrome.storage.local),
    sync: cardMasterCatCatchStorageArea(cardMasterNativeChrome.storage.sync),
    session: cardMasterNativeChrome.storage.session
        ? cardMasterCatCatchStorageArea(cardMasterNativeChrome.storage.session)
        : undefined,
    onChanged: {
        addListener(listener) {
            const wrapped = (changes, areaName) => {
                const scoped = cardMasterCatCatchStorageResult(changes);
                if (Object.keys(scoped).length > 0) {
                    listener(scoped, areaName);
                }
            };
            cardMasterCatCatchStorageListeners.set(listener, wrapped);
            cardMasterNativeChrome.storage.onChanged.addListener(wrapped);
        },
        removeListener(listener) {
            const wrapped = cardMasterCatCatchStorageListeners.get(listener);
            if (wrapped) {
                cardMasterNativeChrome.storage.onChanged.removeListener(wrapped);
                cardMasterCatCatchStorageListeners.delete(listener);
            }
        },
        hasListener(listener) {
            const wrapped = cardMasterCatCatchStorageListeners.get(listener);
            return Boolean(
                wrapped &&
                cardMasterNativeChrome.storage.onChanged.hasListener(wrapped)
            );
        }
    }
};

function cardMasterCatCatchRuleId(tabId) {
    let hash = 2166136261;
    for (const character of String(tabId)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return 1000000000 + ((hash >>> 0) % 1000000000);
}

const cardMasterCatCatchDnr = cardMasterNativeChrome.declarativeNetRequest
    ? new Proxy(cardMasterNativeChrome.declarativeNetRequest, {
        get(target, property) {
            if (property === 'updateSessionRules') {
                return (update, callback) => {
                    const next = {
                        removeRuleIds: (update.removeRuleIds ?? []).map(
                            cardMasterCatCatchRuleId
                        ),
                        addRules: (update.addRules ?? []).map((rule) => ({
                            ...rule,
                            id: cardMasterCatCatchRuleId(
                                rule.condition?.tabIds?.[0] ?? rule.id
                            ),
                            priority: cardMasterCatCatchDnrPriority
                        }))
                    };
                    return callback
                        ? target.updateSessionRules(next, callback)
                        : target.updateSessionRules(next);
                };
            }
            if (property === 'getSessionRules') {
                return (callback) => {
                    const select = (rules) =>
                        rules
                            .filter(
                                (rule) =>
                                    rule.priority ===
                                    cardMasterCatCatchDnrPriority
                            )
                            .map((rule) => ({
                                ...rule,
                                id: rule.condition?.tabIds?.[0] ?? rule.id
                            }));
                    if (callback) {
                        return target.getSessionRules((rules) =>
                            callback(select(rules))
                        );
                    }
                    return target.getSessionRules().then(select);
                };
            }
            return Reflect.get(target, property, target);
        }
    })
    : undefined;

const cardMasterCatCatchSilentEvent = {
    addListener() {},
    removeListener() {},
    hasListener() {
        return false;
    }
};

function cardMasterCatCatchProtocolMessage(message) {
    return Boolean(
        message &&
        typeof message === 'object' &&
        typeof message.Message === 'string'
    );
}

function cardMasterCatCatchMessageEvent(event) {
    const wrappedListeners = new WeakMap();
    return {
        addListener(listener) {
            const wrapped = (message, sender, sendResponse) => {
                if (!cardMasterCatCatchProtocolMessage(message)) return;
                return listener(message, sender, sendResponse);
            };
            wrappedListeners.set(listener, wrapped);
            event.addListener(wrapped);
        },
        removeListener(listener) {
            const wrapped = wrappedListeners.get(listener);
            if (!wrapped) return;
            event.removeListener(wrapped);
            wrappedListeners.delete(listener);
        },
        hasListener(listener) {
            const wrapped = wrappedListeners.get(listener);
            return Boolean(wrapped && event.hasListener?.(wrapped));
        }
    };
}

const cardMasterCatCatchOnMessage = cardMasterCatCatchMessageEvent(
    cardMasterNativeChrome.runtime.onMessage
);

const cardMasterCatCatchRuntime = new Proxy(cardMasterNativeChrome.runtime, {
    get(target, property) {
        if (property === 'onInstalled') {
            return cardMasterCatCatchSilentEvent;
        }
        if (property === 'onMessage') {
            return cardMasterCatCatchOnMessage;
        }
        if (property === 'getManifest') {
            return () => ({
                manifest_version: 3,
                name: '顺手牵羊',
                version: '2.7.2',
                homepage_url: 'https://github.com/xifangczy/cat-catch',
                action: { default_popup: 'popup.html' },
                options_ui: { page: 'options.html', open_in_tab: true }
            });
        }
        if (property === 'sendMessage') {
            return (messageOrId, ...rest) =>
                typeof messageOrId === 'string' && rest.length > 0
                    ? target.sendMessage(...rest)
                    : target.sendMessage(messageOrId, ...rest);
        }
        return Reflect.get(target, property, target);
    }
});

const cardMasterCatCatchAction = {
    setBadgeText(details, callback) {
        queueMicrotask(() => {
            globalThis.__cardMasterCatCatchChanged?.(details?.tabId);
        });
        callback?.();
        return Promise.resolve();
    },
    setIcon(_details, callback) {
        callback?.();
        return Promise.resolve();
    },
    setTitle(_details, callback) {
        callback?.();
        return Promise.resolve();
    }
};

const cardMasterCatCatchSidePanel = {
    setOptions() {
        return Promise.resolve();
    },
    setPanelBehavior() {
        return Promise.resolve();
    }
};

globalThis.__cardMasterCatCatchChrome = new Proxy(cardMasterNativeChrome, {
    get(target, property) {
        if (property === 'storage') return cardMasterCatCatchStorage;
        if (property === 'runtime') return cardMasterCatCatchRuntime;
        if (property === 'action') return cardMasterCatCatchAction;
        if (property === 'sidePanel') return cardMasterCatCatchSidePanel;
        if (property === 'declarativeNetRequest') {
            return cardMasterCatCatchDnr;
        }
        if (property === 'webNavigation') {
            return (
                target.webNavigation ?? {
                    getAllFrames(_details, callback) {
                        callback?.([]);
                        return Promise.resolve([]);
                    },
                    onBeforeNavigate: cardMasterCatCatchSilentEvent,
                    onHistoryStateUpdated: cardMasterCatCatchSilentEvent,
                    onCommitted: cardMasterCatCatchSilentEvent,
                    onCompleted: cardMasterCatCatchSilentEvent
                }
            );
        }
        return Reflect.get(target, property, target);
    }
});
})();
