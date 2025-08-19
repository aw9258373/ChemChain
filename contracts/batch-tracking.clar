;; Batch Tracking Contract
;; Clarity v2
;; Tracks chemical batches through supply chain with immutable records and oracle integration

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BATCH u101)
(define-constant ERR-INVALID-STAGE u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-ALREADY-EXISTS u105)
(define-constant ERR-INVALID-ORACLE u106)

;; Batch status enum
(define-constant STATUS-CREATED u0)
(define-constant STATUS-PROCESSED u1)
(define-constant STATUS-SHIPPED u2)
(define-constant STATUS-DELIVERED u3)
(define-constant STATUS-REJECTED u4)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var oracle principal 'SP000000000000000000002Q6VF78) ;; Default to burn address, updated by admin
(define-data-var batch-counter uint u0)

;; Data structures
(define-map batches 
  { batch-id: uint }
  { 
    manufacturer: principal,
    composition: (string-utf8 256),
    origin-timestamp: uint,
    current-owner: principal,
    current-stage: uint,
    last-update: uint,
    is-active: bool
  }
)

(define-map batch-history
  { batch-id: uint, update-index: uint }
  {
    stage: uint,
    owner: principal,
    timestamp: uint,
    metadata: (string-utf8 512)
  }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: is-valid-stage
(define-private (is-valid-stage (stage uint))
  (or (is-eq stage STATUS-CREATED)
      (is-eq stage STATUS-PROCESSED)
      (is-eq stage STATUS-SHIPPED)
      (is-eq stage STATUS-DELIVERED)
      (is-eq stage STATUS-REJECTED))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Set oracle principal
(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-oracle 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set oracle new-oracle)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Create a new batch
(define-public (create-batch (composition (string-utf8 256)) (owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let ((batch-id (+ (var-get batch-counter) u1)))
      (var-set batch-counter batch-id)
      (asserts! (is-none (map-get? batches { batch-id: batch-id })) (err ERR-ALREADY-EXISTS))
      (map-set batches 
        { batch-id: batch-id }
        { 
          manufacturer: tx-sender,
          composition: composition,
          origin-timestamp: block-height,
          current-owner: owner,
          current-stage: STATUS-CREATED,
          last-update: block-height,
          is-active: true
        }
      )
      (map-set batch-history
        { batch-id: batch-id, update-index: u0 }
        { 
          stage: STATUS-CREATED,
          owner: owner,
          timestamp: block-height,
          metadata: u"Batch created"
        }
      )
      (ok batch-id)
    )
  )
)

;; Update batch status (oracle or owner)
(define-public (update-batch-status (batch-id uint) (new-stage uint) (metadata (string-utf8 512)))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-stage new-stage) (err ERR-INVALID-STAGE))
    (let ((batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH))))
      (asserts! (is-eq (get is-active batch) true) (err ERR-INVALID-BATCH))
      (asserts! (or (is-eq tx-sender (get current-owner batch)) 
                    (is-eq tx-sender (var-get oracle))) 
                (err ERR-NOT-AUTHORIZED))
      (let ((update-index (+ (default-to u0 (map-get? batch-history { batch-id: batch-id, update-index: u0 }) .update-index) u1)))
        (map-set batches 
          { batch-id: batch-id }
          (merge batch { 
            current-stage: new-stage,
            last-update: block-height,
            is-active: (not (is-eq new-stage STATUS-REJECTED))
          })
        )
        (map-set batch-history
          { batch-id: batch-id, update-index: update-index }
          { 
            stage: new-stage,
            owner: (get current-owner batch),
            timestamp: block-height,
            metadata: metadata
          }
        )
        (ok true)
      )
    )
  )
)

;; Transfer batch ownership
(define-public (transfer-batch (batch-id uint) (new-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq new-owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let ((batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH))))
      (asserts! (is-eq tx-sender (get current-owner batch)) (err ERR-NOT-AUTHORIZED))
      (asserts! (get is-active batch) (err ERR-INVALID-BATCH))
      (let ((update-index (+ (default-to u0 (map-get? batch-history { batch-id: batch-id, update-index: u0 }) .update-index) u1)))
        (map-set batches 
          { batch-id: batch-id }
          (merge batch { current-owner: new-owner, last-update: block-height })
        )
        (map-set batch-history
          { batch-id: batch-id, update-index: update-index }
          { 
            stage: (get current-stage batch),
            owner: new-owner,
            timestamp: block-height,
            metadata: u"Ownership transferred"
          }
        )
        (ok true)
      )
    )
  )
)

;; Deactivate batch (admin only)
(define-public (deactivate-batch (batch-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (let ((batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH))))
      (asserts! (get is-active batch) (err ERR-INVALID-BATCH))
      (map-set batches 
        { batch-id: batch-id }
        (merge batch { is-active: false, last-update: block-height })
      )
      (ok true)
    )
  )
)

;; Read-only: get batch details
(define-read-only (get-batch (batch-id uint))
  (ok (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH)))
)

;; Read-only: get batch history
(define-read-only (get-batch-history (batch-id uint) (index uint))
  (ok (unwrap! (map-get? batch-history { batch-id: batch-id, update-index: index }) (err ERR-INVALID-BATCH)))
)

;; Read-only: get batch counter
(define-read-only (get-batch-counter)
  (ok (var-get batch-counter))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: get oracle
(define-read-only (get-oracle)
  (ok (var-get oracle))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)