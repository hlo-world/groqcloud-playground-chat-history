// ==UserScript==
// @name        Groqcloud Playground Chat History
// @version     0.2.0
// @description Adds a Chat History on the sidebar of Groqcloud Playground with locally-stored deletable per-session entries
// @author      Harris Lo
// @website     https://github.com/hlo-world/groqcloud-playground-chat-history
// @match       https://console.groq.com/*
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @grant       GM_addStyle
// @grant       GM_deleteValue
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_listValues
// ==/UserScript==

$(document).ready(function() {
    // Check if dark mode is enabled
    var isDarkMode = $('.dark').length > 0;

    // Set the background color based on dark mode
    var backgroundColor = isDarkMode ? '#0D1646' : '#F87F67';

    // Set the formatted date for this session
    var date = new Date();
    var formattedDate = date.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\s/g, '').replace(/M/g, '');

    // Set the prefix for GM value store keys
    var keyPrefix = 'Groq';

    function createHistoryEntry(key, value) {
        return `<li><details><summary>${key} <button class="deleteButton">&#128465</button></summary><p>${value}</p></details></li>`;
    }

    function addDeleteHistoryListener() {
        $('.deleteButton').click(function(event) {
            var summaryElement = $(this).closest('summary');
            var key = summaryElement.text().trim().split(' ')[0];
            GM_deleteValue(keyPrefix + key);
            $(this).closest('li').remove();
        });
    }

    function appendSidebar() {
        if ($('#groqChatHistorySideBar').length === 0) {
            var targetDiv = $('div.relative.flex.flex-1.flex-col.justify-end.p-3.gap-2');
            var historyListHTML = '<ul id="historyList"><li></li>';

            var keys = GM_listValues().filter(function(key) {
                return key.includes(keyPrefix);
            });
            for (var i = keys.length - 1; i >= 0; i--) {
                var key = keys[i];
                var value = GM_getValue(key);
                historyListHTML += createHistoryEntry(key.replace(keyPrefix, ''), value);
            }

            historyListHTML += '</ul>';

            targetDiv.prepend(`
                <div id="groqChatHistorySideBar">
                    <p>Chat History</p>
                    ${historyListHTML}
                </div>
            `);
            addDeleteHistoryListener();
        }
    }

    function mutationCallback(mutationsList, observer) {
        for (var mutation of mutationsList) {
            if (mutation.type === 'childList') {
                appendSidebar();
            }
        }
    }

    var observer = new MutationObserver(mutationCallback);
    var targetNode = document.body;
    var config = { childList: true, subtree: true };
    observer.observe(targetNode, config);

    window.addEventListener('beforeunload', function() {
        observer.disconnect();
    });

    GM_addStyle(`
        #groqChatHistorySideBar {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: ${backgroundColor};
            z-index: 9999;
            max-height: 75%;
            overflow: auto;
            scrollbar-gutter: stable;
            padding: 0.4em;
            font-size: small;
        }

        #groqChatHistorySideBar ul {
            margin: 0ex;
        }

        #groqChatHistorySideBar a {
            color: blue;
        }
    `);

    // Function to append textarea content to sidebar when submit request is made
    function addSubmitRequestListener() {
        var userInputTextArea = 'textarea.border-input';
        var outputGroups = '.h-full.overflow-auto .group';
        var outputGroupTextArea = 'textarea';
        var userGroupIdentifier = 'button:contains("user")';
        var assistantGroupIdentifier = 'button:contains("assistant")';
        var replyCompletionIdentifier = 'a[data-state="closed"][class*="text-muted-accent"]';
        var submitButtonIdentifier = 'button:contains("Submit")';
        var textSeparation = '<br><hr style="width: 100%; border-color: var(--foreground); border-style: solid;">';

        $(userInputTextArea).on('keydown', function(event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                submitHandler();
            }
        });

        $(submitButtonIdentifier).click(submitHandler);

        async function submitHandler() {
            function waitForNewGroupsLengthEqual(previousUserGroupsLength) {
                var userGroups = $(outputGroups).filter(function() {
                    return $(this).find(userGroupIdentifier).length > 0;
                });
                var assistantGroups = $(outputGroups).filter(function() {
                    return $(this).find(assistantGroupIdentifier).length > 0;
                });
                if (userGroups.length <= previousUserGroupsLength || userGroups.length !== assistantGroups.length) {
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            resolve(waitForNewGroupsLengthEqual(previousUserGroupsLength));
                        }, 100);
                    });
                } else {
                    return Promise.resolve({ userGroups, assistantGroups });
                }
            }
            function waitForAssitantReplyCompleted(assistantGroups) {
                var lastAssistantObject = assistantGroups[assistantGroups.length - 1];
                const completionElement = document.querySelector(replyCompletionIdentifier);
                if (completionElement) {
                    return Promise.resolve();
                } else {
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            resolve(waitForAssitantReplyCompleted(assistantGroups));
                        }, 10);
                    });
                }
            }
            function collectNarrative(userGroups, assistantGroups) {
                var completeNarrative = [];
                for (var i = 0; i < userGroups.length; i++) {
                    var userText = userGroups.eq(i).find(outputGroupTextArea).text().replace(/\n/g, '<br>');
                    var assistantText = assistantGroups.eq(i).find(outputGroupTextArea).text().replace(/\n/g, '<br>');
                    var interleavedText = (userText || '') + textSeparation + (assistantText || '');
                    if (!completeNarrative.includes(interleavedText)) {
                        completeNarrative.push(interleavedText);
                    }
                }
                return completeNarrative;
            }
            function appendToSideBar(completeNarrative) {
                var existingEntry = $('#groqChatHistorySideBar ul li').filter(function() {
                    return $(this).text().includes(formattedDate);
                });
                if (existingEntry.length > 0) {
                    existingEntry.remove();
                }
                var flattenedCompleteNarrative = completeNarrative.join(textSeparation);
                $('#groqChatHistorySideBar ul').prepend(createHistoryEntry(formattedDate, flattenedCompleteNarrative));
                GM_setValue(keyPrefix + formattedDate, flattenedCompleteNarrative);
                addDeleteHistoryListener();
            }

            var previousUserGroups = $(outputGroups).filter(function() {
                    return $(this).find(userGroupIdentifier).length > 0;
                });
            var { userGroups, assistantGroups } = await waitForNewGroupsLengthEqual(previousUserGroups.length);
            await waitForAssitantReplyCompleted(assistantGroups);
            var completeNarrative = collectNarrative(userGroups, assistantGroups);
            appendToSideBar(completeNarrative);
        }
    }

    /*
     * Function to switch playground mode
     * As of 2024-07-18:
     *     [0] is Studio mode
     *     [1] is Chat mode
    */
    function switchPlaygroundMode(mode) {
        // Get the list of mode button elements
        var modeButtonList = document.querySelectorAll('button.block.rounded-full.text-xs.px-3.py-1.h-auto');
        // Click the mode button at desired index
        modeButtonList[mode].click();
    }

    addSubmitRequestListener();
    switchPlaygroundMode(1);
});