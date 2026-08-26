(function () {
    if (window.parent === window) {
        return;
    }

    let lastHeight = 0;
    const publishHeight = () => {
        const height = Math.ceil(
            Math.max(
                document.documentElement.scrollHeight,
                document.body?.scrollHeight ?? 0
            )
        );
        if (height === lastHeight) {
            return;
        }
        lastHeight = height;
        window.parent.postMessage(
            {
                source: 'card-master-cat-catch',
                type: 'resize',
                height
            },
            '*'
        );
    };

    new ResizeObserver(publishHeight).observe(document.documentElement);
    new MutationObserver(publishHeight).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
    });
    window.addEventListener('load', publishHeight);
    publishHeight();
})();
