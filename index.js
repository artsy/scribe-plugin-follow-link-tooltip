// Google Docs inspired link editing inside tooltip
// Based upon tooltip plugin by Artsy.net (https://github.com/artsy/scribe-plugin-link-tooltip)
// and fork by ePages (https://github.com/ePages-de/scribe-plugin-enhanced-link-tooltip)
(function () {
  'use strict';

  var scribePluginFollowLinkTooltip = function () {
    return function (scribe) {
      var nodeName = 'A',
      isEditState = false,

      // setup UI DOM
      namespace = 'scribe-plugin-link-tooltip',
      tooltipNode = (function () {
        var newTooltip = document.createElement('form'),
        parentElement = scribe.el.parentNode;
        newTooltip.className = namespace + ' ' + namespace + '-hidden';
        newTooltip.style.position = 'absolute';

        newTooltip.innerHTML = '<a data-scribe-plugin-link-tooltip-role="link"' +
          'class="scribe-plugin-link-tooltip-show-on-view" target="_new"></a>' +
          '<input data-scribe-plugin-link-tooltip-role="input"' +
          'class="scribe-plugin-link-tooltip-show-on-edit" placeholder="Paste in the URL of the artist"/>' +
          '<button data-scribe-plugin-link-tooltip-role="submit" type="submit"' +
          'class="scribe-plugin-link-tooltip-show-on-edit">Apply</button>' +
          '<button data-scribe-plugin-link-tooltip-role="remove" type="button"' +
          'class="scribe-plugin-link-tooltip-show-on-view">Remove</button>';

        if (getComputedStyle(parentElement).position === 'static') {
          parentElement.style.position = 'relative';
        }

        // prepend in order to preserve collapsing margins at the bottom
        parentElement.insertBefore(newTooltip, parentElement.firstChild);

        return newTooltip;
      }()),
      ui = { /* eslint key-spacing:0 */
        link:      tooltipNode.querySelector('[data-' + namespace + '-role=link]'),
        linkInput: tooltipNode.querySelector('[data-' + namespace + '-role=input]'),
        editBtn:   tooltipNode.querySelector('[data-' + namespace + '-role=edit]'),
        applyBtn:  tooltipNode.querySelector('[data-' + namespace + '-role=submit]'),
        removeBtn: tooltipNode.querySelector('[data-' + namespace + '-role=remove]')
      },

      linkSanitizer = function (str) {
        // Positron will sanitize https
        return str.split('?')[0]
      },

      // Extends selection to whole anchor. Returns anchor node or undefined.
      selectAnchorContent = function (selection) {
        var node, range;

        // nothing selected?
        if (typeof selection.range === 'undefined' || selection.range.collapsed) {
          node = selection.getContaining(function (testNode) {
            return testNode.nodeName === nodeName;
          });

          // are we inside an <a>?
          if (node) {
            range = document.createRange();
            range.selectNode(node);
            selection.range = range;
            selection.selection.addRange(range);
          }
        }
        return node;
      },

      showTooltip = function (state, selection, node, val, submitCallback) {
        var teardown = function () {
          isEditState = false;
          tooltipNode.classList.add(namespace + '-hidden');

          /* eslint no-use-before-define:0 */ // circular references
          tooltipNode.removeEventListener('submit', link);
          ui.removeBtn.removeEventListener('click', unlink);
          document.removeEventListener('click', onBlur);
          window.removeEventListener('resize', repositionTooltip);
        },
        link = function (e) {
          e.preventDefault();
          teardown();
          submitCallback(linkSanitizer(String(ui.linkInput.value).trim()));
        },
        unlink = function () {
          $(selection.selection.baseNode).parent().next('.artist-follow').remove()
          selectAnchorContent(selection);
          new scribe.api.Command('unlink').execute();
          getSelection().collapseToEnd();
          teardown();
        },
        onBlur = function (e) {
          var isSameNode = e.target === node,
            selfOrParentAnchor = $(e.target).closest(nodeName).get(0), // get(0) to get DOM node
            isEditableLink = selfOrParentAnchor && selfOrParentAnchor.isContentEditable;

          var isTooltipUiElement   = !! $(tooltipNode).has($(e.target)).length > 0;
          if (isSameNode || isTooltipUiElement) {
            return true; // let blur event pass through
          }

          // make seamless switch to any other editable link possible, even across scribe instances
          if (isEditableLink) {
            setTimeout(function () {
              e.target.dispatchEvent(new Event(namespace + '-query-state', {
                bubbles: true
              }));
            }, 0);
          }
          teardown();
        },
        updateUi = function () {
          // set visibilities according to state
          tooltipNode.classList.remove(namespace + '-state-edit');
          tooltipNode.classList.remove(namespace + '-state-view');
          tooltipNode.classList.add(namespace + '-state-' + state);
        },
        repositionTooltip = function () {
          // calculate position
          var selectionRects = (function () {
            var rects = selection.range.getClientRects();
            if (!rects.length) {
              rects = selection.range.startContainer.getClientRects();
            }
              return rects;
          }()),
          scribeParentRect = scribe.el.parentNode.getBoundingClientRect(),
          biggestSelection = [].reduce.call(selectionRects, function (biggest, rect) {
            return rect.width >= biggest.width ? {
              rect: rect,
              width: rect.width
            } : {
              rect: biggest.rect,
              width: biggest.width
            };
          }, {
            width: 0
          }),
          left = biggestSelection.rect ? biggestSelection.rect.left : 0,
          top = selectionRects.length ? selectionRects[selectionRects.length - 1].bottom : 0,
          tooltipWidth = parseFloat(getComputedStyle(tooltipNode).width),
          offsetLeft = left - scribeParentRect.left - tooltipWidth / 2;
          // set position
          tooltipNode.style.top = top - scribeParentRect.top + 'px';
          tooltipNode.style.left = offsetLeft + 'px';

          // show
          tooltipNode.classList.remove(namespace + '-hidden');
        };

        if (state === 'edit') {
          isEditState = true;
        }

        // update link value
        ui.link.href = ui.link.title = ui.link.innerHTML = ui.linkInput.value = val;
        updateUi();
        repositionTooltip();

        window.addEventListener('resize', repositionTooltip);
        tooltipNode.addEventListener('submit', link);
        ui.removeBtn.addEventListener('click', unlink);

        // On clicking off the tooltip, hide the tooltip.
        // Deferred because otherwise it would be called immediately
        // by the click event leading us here bubbling up.
        setTimeout(function () {
          document.addEventListener('click', onBlur);
        }, 300);
      },

      executeCommand = function () {
        var selection = new scribe.api.Selection(),
        node = selectAnchorContent(selection),
        content = node && node.getAttribute('href') || ''; // ! not node.href as that would be expanded
        if($(node).hasClass('is-jump-link') || $(node).hasClass('is-follow-link')){
          return
        }
        showTooltip('edit', selection, node, content, function (newHref) {
          getSelection().removeAllRanges();
          getSelection().addRange(selection.range);
          if (newHref === '') {
            new scribe.api.Command('unlink').execute();
          } else {
            if (selection.selection.baseNode.parentElement.nodeName === 'A'){
              var parent = selection.selection.baseNode.parentElement
              parent.classList.add('is-follow-link')
              parent.setAttribute('href',newHref)
              var artistSlug = newHref.split("/artist/")[1]
              var append = "<a data-id='"+ artistSlug + "' class='entity-follow artist-follow'></a>"
              parent.insertAdjacentHTML('afterend',append)
            }else{
              var fullString = selection.selection.baseNode.textContent
              var startOffset = selection.range.startOffset
              var numOfChar = selection.range.endOffset - startOffset
              var replace = fullString.substr(startOffset, numOfChar)
              var artistSlug = newHref.split("/artist/")[1]
              replace = "<a href='"+ newHref + "' class='is-follow-link'>" + replace + "</a>" +
                "<a data-id='"+ artistSlug + "' class='entity-follow artist-follow'></a>"
              var newHtml = splice(fullString, startOffset, numOfChar, replace);
              $(selection.selection.baseNode).replaceWith(newHtml);
            }
          }
          scribe.el.focus();
          getSelection().collapseToEnd();
        }.bind(this));

        var splice = function(str, start,length,replacement) {
          return str.substr(0,start)+replacement+str.substr(start+length);
        }

        ui.linkInput.focus();
      },

    // Show the tooltip when a link has focus. When submitting change the link.
    // todo hide on esc key (bonus: also when in view state, until link regains focus)
      queryState = function () {
        var selection = new scribe.api.Selection();
          return isEditState || selection.getContaining(function (node) {
            if (node.nodeName === 'A' && !isEditState && $(node).parents('.edit-section-text-editable').length > 0 && !$(node).hasClass('is-jump-link') && $(node).hasClass('is-follow-link')) {
              showTooltip('view', selection, node, node.getAttribute('href'), function (newHref) {
                var artistSlug = newHref.split("/artist/")[1]
                $(node).next('a').data('id',artistSlug)
                node.href = newHref;
                // scribe (or the browser?) automatically removes the link if newHref is empty
              });
            } else {
              tooltipNode.classList.add(namespace + '-hidden');
            }
            return node.nodeName === nodeName;
          });
      };

      // bind and register
      var followLinkTooltipCommand = new scribe.api.Command('createLink');
      scribe.commands.followLink = followLinkTooltipCommand;

      followLinkTooltipCommand.queryState = queryState;
      followLinkTooltipCommand.execute = executeCommand.bind(followLinkTooltipCommand);

      // bubbling up when switching from another editable link
      scribe.el.addEventListener(namespace + '-query-state', queryState);
    };
  };

  // Export for CommonJS & window global. TODO: AMD
  if (typeof module != 'undefined') {
    module.exports = scribePluginFollowLinkTooltip;
  } else {
    window.scribePluginFollowLinkTooltip = scribePluginFollowLinkTooltip;
  }
})();
