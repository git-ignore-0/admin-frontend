# Workshop delete and archive flow

## Product promise

A website administrator can remove an obsolete workshop from the CMS without needing direct
backend access and without mistaking a reversible unpublish action for permanent removal.

## Behavior

- An existing draft-only workshop exposes **Delete workshop**. Confirmation explains that all
  content is permanently deleted and cannot be restored.
- A currently published workshop exposes **Archive workshop**. Confirmation explains that it is
  removed from the public website and admin list, unsaved edits are lost, and the admin has no
  restore flow.
- **Unpublish** remains a separate, reversible action that keeps the draft in the admin list.
- New unsaved workshops do not expose delete because no backend entity exists yet.
- Destructive requests use the existing same-origin BFF and Django `DELETE` contract. All editor
  actions are disabled while the request is pending to prevent duplicate mutations.
- Success returns the administrator to `/workshops`; failure keeps the editor open and shows the
  localized error toast.

## Responsive and accessible interaction

The destructive action is visually separated from save/publish actions on wider screens. On narrow
screens it joins the existing single-column action stack with a full-width touch target. The native
confirmation dialog provides keyboard focus management and Escape cancellation consistently with
the editor's existing publish and unpublish confirmations.

## Acceptance criteria

- Draft-only and published workshops show the correct localized action and confirmation copy.
- Cancelling confirmation sends no request.
- Confirming sends one authenticated `DELETE` request and navigates only after success.
- Repeated activation while pending cannot send a second request.
- API failure leaves the workshop visible and announces an error.
