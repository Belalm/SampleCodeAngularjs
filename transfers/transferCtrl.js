"use strict";

/* globals app, console, angular */

app.controller('TransferCtrl', ['$rootScope', '$scope', '$http', 'AuthService', '$filter', 'Accounts', 'Messages', 'TransferData', '$state', '$uibModal', '$timeout', 'ActivityService', 'SelectedPaymentData', 'Transactions', 'FileUploader', 'Settings', 'OTP', '$q',
    function($rootScope, $scope, $http, Auth, $filter, Accounts, Messages, TransferData, $state, $uibModal, $timeout, ActivityService, SelectedPaymentData, Transactions, FileUploader, Settings, OTP, $q) {

        $scope.showLogs = false;
        $scope.pageLoading = true;
        $scope.todayDate = new Date();

        var uploader = $scope.uploader = new FileUploader();
        $scope.jsonBulk = [];
        $scope.showAddFees = false;
        $scope.bulkErrorMessages = [];

        // FROM:
        // 1st level of permissions:
        //      Auth Engine Permissions, returned in login, found in AuthService
        // 2nd level of permissions: ?????
        //      Customer (can_pay, can_trf_internal, can_trf_bank, can_trf_domestic, can_trf_intl)
        // 3rd level of permissions:
        //      Account (can_pay, can_trf_internal, can_trf_bank, can_trf_domestic, can_trf_intl, can_receive_trf)
        // 4th level of permissions:
        //      Account Type (can_pay, can_trf_internal, can_trf_bank, can_trf_domestic, can_trf_intl, can_receive_trf)

        var hasOwnTransfer = (Auth.getPermissionValue('transfer', 'own') === 'T') || (Auth.getPermissionValue('transfer', 'edit_own') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        var hasCrdTransfer = (Auth.getPermissionValue('transfer', 'crd') === 'T') || (Auth.getPermissionValue('transfer', 'edit_crd') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        var hasBnkTransfer = (Auth.getPermissionValue('transfer', 'bnk') === 'T') || (Auth.getPermissionValue('transfer', 'edit_bnk') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        var hasDomTransfer = (Auth.getPermissionValue('transfer', 'dom') === 'T') || (Auth.getPermissionValue('transfer', 'edit_dom') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        var hasIntTransfer = (Auth.getPermissionValue('transfer', 'int') === 'T') || (Auth.getPermissionValue('transfer', 'edit_int') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        var hasBulkTransfer = (Auth.getPermissionValue('transfer', 'int') === 'T') || (Auth.getPermissionValue('transfer', 'edit_blk') === 'T') || (Auth.getPermissionValue('transfer', '*') === 'T');
        $scope.hasBulkTransfer = hasBulkTransfer;

        var accountsListEmptyMsg,
            cardsListEmptyMsg,
            domesticTransferMsg,
            intlTransferMsg,
            beneficiaryListEmptyMsg,
            benefDisclaimer,
            benef_allowed_characters,
            benef_maximum_characters,
            reason_maximum_characters,
            reason_allowed_characters,
            benef_acc_num_allowed_characters,
            benef_acc_num_maximum_characters,
            verificationErrorMessages;

        $scope.paymentTypes = [];
        var paymentTypeCodes = [];
        var loadPaymentTypes = function() {
            if (hasOwnTransfer || hasCrdTransfer) {
                $scope.paymentTypes.push({
                    displayNameCode: 'own_accounts',
                    code: 'own',
                    fromFilter: function(a) {
                        // if ($scope.toAccount && a.account_id === $scope.toAccount.account_id) return false;
                        if (a.ib_type === 'account' && a.status === 'A') {
                            if (a.can_trf_internal !== false && a.account_type && a.account_type.can_trf_internal !== false)
                                return true;
                        }
                        return false;
                    },
                    fromEmptyMsg: accountsListEmptyMsg,
                    toCriteria: {
                        data: 'accounts',
                        toFilter: function(a) {
                            if (a.ib_type === 'account' && hasOwnTransfer) {
                                if (a.status === 'A' && a.can_receive_trf !== false && a.account_type && a.account_type.can_receive_trf !== false)
                                    return true;
                            } else if (a.ib_type === 'card' && hasCrdTransfer) {
                                if (a.status === 'A' && a.card_type && a.card_type.category === 1 && a.card_type.can_receive_trf !== false)
                                    return true;
                            }
                            return false;
                        },
                        canAdd: false,
                        canEdit: false,
                        canUpload: false,
                        canDownload: false,
                        titleCode: 'select_transfer_to_account',
                        emptyMsg: cardsListEmptyMsg
                    },
                    currencyFilter: function(a, b) {
                        if (b.ib_type === 'card') return ['OMR'];
                        return (a.currency === b.currency) ? [a.currency] : [a.currency, b.currency];
                    }
                });
                paymentTypeCodes.push('own');
            }

            if (hasBnkTransfer) {
                $scope.paymentTypes.push({
                    displayNameCode: 'bank_beneficiaries',
                    code: 'bank_benef',
                    fromFilter: function(a) {
                        if (a.ib_type === 'account' && a.status === 'A') {
                            if (a.can_trf_bank !== false && a.account_type && a.account_type.can_trf_bank !== false)
                                return true;
                        }
                        return false;
                    },
                    fromEmptyMsg: accountsListEmptyMsg,
                    toCriteria: {
                        data: 'beneficiaries',
                        toFilter: function(b) {
                            return (b.type === 'B');
                        },
                        bankFilter: function(b) {
                            return (b.type === 'B');
                        },
                        canAdd: true,
                        canEdit: true,
                        canUpload: false,
                        canDownload: false,
                        accNoMaxLength: 16,
                        titleCode: 'select_transfer_beneficiary',
                        emptyMsg: beneficiaryListEmptyMsg,
                        disclaimer: benefDisclaimer
                    },
                    currencyFilter: function(a, b) {
                        return (a.currency === b.currency) ? [a.currency] : [a.currency, b.currency];
                    }
                });
                paymentTypeCodes.push('bank_benef');
            }
            if (hasDomTransfer) {
                $scope.paymentTypes.push({
                    displayNameCode: 'domestic_beneficiaries',
                    code: 'domestic_benef',
                    fromFilter: function(a) {
                        if (a.ib_type === 'account' && a.status === 'A') {
                            if (a.can_trf_domestic !== false && a.account_type.can_trf_domestic !== false)
                                return true;
                        }
                        return false;
                    },
                    fromEmptyMsg: accountsListEmptyMsg,
                    toCriteria: {
                        data: 'beneficiaries',
                        toFilter: function(b) {
                            return (b.type === 'D');
                        },
                        bankFilter: function(b) {
                            return (b.type === 'D');
                        },
                        canAdd: true,
                        canEdit: true,
                        canUpload: false,
                        canDownload: false,
                        accNoMaxLength: 16,
                        titleCode: 'select_transfer_beneficiary',
                        emptyMsg: beneficiaryListEmptyMsg,
                        disclaimer: benefDisclaimer
                    },
                    currencyFilter: function() {
                        return [$scope.base_currency];
                    }
                });
                paymentTypeCodes.push('domestic_benef');
            }
            if (hasIntTransfer) {
                $scope.paymentTypes.push({
                    displayNameCode: 'international_beneficiaries',
                    code: 'intl_benef',
                    fromFilter: function(a) {
                        if (a.ib_type === 'account' && a.status === 'A') {
                            if (a.can_trf_intl !== false && a.account_type && a.account_type.can_trf_intl !== false)
                                return true;
                        }
                        return false;
                    },
                    fromEmptyMsg: accountsListEmptyMsg,
                    toCriteria: {
                        data: 'beneficiaries',
                        toFilter: function(b) {
                            return (b.type === 'I');
                        },
                        bankFilter: function(b) {
                            return (b.type === 'I');
                        },
                        canAdd: true,
                        canEdit: true,
                        canUpload: false,
                        canDownload: false,
                        titleCode: 'select_transfer_beneficiary',
                        emptyMsg: beneficiaryListEmptyMsg,
                        disclaimer: benefDisclaimer
                    },
                    currencyFilter: function() {
                        // TODO: check
                        return [$scope.base_currency];
                    }
                });
                paymentTypeCodes.push('intl_benef');
            }
            if (hasBulkTransfer) {
                $scope.paymentTypes.push({
                    displayNameCode: 'bulk_transfer',
                    code: 'bulk',
                    fromFilter: function(a) {
                        if (a.ib_type === 'account' && a.status === 'A') {
                            if (a.can_trf_bulk !== false && a.account_type && a.account_type.can_trf_bulk !== false)
                                return true;
                        }
                        return false;
                    },
                    fromEmptyMsg: accountsListEmptyMsg,
                    toCriteria: {
                        data: 'excel_sheet',
                        canAdd: false,
                        canEdit: false,
                        canUpload: true,
                        canDownload: true,
                        titleCode: 'upload_bulk_sheet'
                    },
                    currencyFilter: function() {
                        // TODO: check
                        return [$scope.base_currency];

                    }
                });
                paymentTypeCodes.push('bulk_transfer');
            }
        };

        $scope.paymentTypeChanged = function(type, prefilledData) {
            if (!type) return;
            if ($scope.paymentType && $scope.paymentType.code === type.code) return;
            $scope.jsonBulk = null;
            $scope.paymentType = type;
            $scope.toAccount = null;
            $scope.fromAccount = null;
            $scope.select.toAcc = null;
            $scope.select.fromAcc = null;
            $scope.currencies = null;
            $scope.transferCurrency = null;
            $scope.transferAmount = null;
            $scope.hideReason = false;

            if (type.code === 'bulk') {
                $scope.hideReason = true;
            }

            $scope.toAccountFiltered = $filter('filter')(angular.copy($scope[type.toCriteria.data]), type.toCriteria.toFilter);

            if (prefilledData && (SelectedPaymentData.to_account_id || SelectedPaymentData.to_card_id || SelectedPaymentData.benef_id)) {
                var query = {};
                if (SelectedPaymentData.to_account_id) query.account_id = SelectedPaymentData.to_account_id;
                if (SelectedPaymentData.to_card_id) query.card_id = SelectedPaymentData.to_card_id;
                if (SelectedPaymentData.benef_id) query.beneficiary_id = SelectedPaymentData.benef_id;
                $scope.chooseToAccount($filter('filter')($scope.toAccountFiltered, query)[0]);
            }

            $scope.fromAccountFiltered = $filter('filter')(angular.copy($scope.accounts), type.fromFilter);
            if (prefilledData && SelectedPaymentData.from_account_id) {
                $scope.chooseFromAccount($filter('filter')($scope.fromAccountFiltered, { account_id: SelectedPaymentData.from_account_id })[0]);
            } else if (!$scope.toAccount && $scope.fromAccountFiltered && $scope.fromAccountFiltered.length === 1) {
                $scope.chooseFromAccount($scope.fromAccountFiltered[0]);
            }

            // TODO: test
            if (prefilledData && SelectedPaymentData.reason) {
                $scope.transferReason = SelectedPaymentData.reason;
            }
            if (prefilledData && SelectedPaymentData.amount) {
                $scope.transferAmount = SelectedPaymentData.amount;
            }
            if (prefilledData && SelectedPaymentData.currency) {
                $scope.transferCurrency = SelectedPaymentData.currency;
            }
            if (prefilledData && SelectedPaymentData.shareType) {
                $scope.transferShareType = SelectedPaymentData.shareType;
            }
        };

        function randomString(length, chars) {
            var result = '';
            for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
            return result;
        }
        var uniqueIdentifier;

        var reset = function() {
            SelectedPaymentData.type = null;
            SelectedPaymentData.from_account_id = null;
            SelectedPaymentData.to_account_id = null;
            SelectedPaymentData.to_card_id = null;
            SelectedPaymentData.bill_id = null;
            SelectedPaymentData.benef_id = null;
            $state.reload();
        };

        $scope.clearErrorMsg = function() {
            $scope.errorMsg = null;
            $scope.error = {};
            $scope.success = {};
        };

        // ******* STEP 1 ******* //
        $scope.step = 1;

        $scope.accounts = [];
        $scope.beneficiaries = [];

        var arrangeBenefs = function(data) {
            $scope.beneficiaries = $filter('filter')(data, function(b) {
                b.displayedName = b.nickname || (b.rcpt_first_name + ' ' + b.rcpt_last_name);

                if (b.type === 'I' && b.status === 'P')
                    b.info1 = b.bank_swift + ' (' + b.bank_country.country_code + ')' + ', ' + $filter('translate')('pending_approval');
                else if (b.type === 'I' && b.status === 'R')
                    b.info1 = b.bank_swift + ' (' + b.bank_country.country_code + ')' + ', ' + $filter('translate')('transfer_status_R');
                else
                    b.info1 = b.bank_swift + ' (' + b.bank_country.country_code + ')';

                if (b.type === 'B') {
                    b.ib_type = 'bank_benef';
                    if (!hasBnkTransfer) return false;
                } else if (b.type === 'D') {
                    b.ib_type = 'domestic_benef';
                    if (!hasDomTransfer) return false;
                } else if (b.type === 'I') {
                    b.ib_type = 'intl_benef';
                    if (!hasIntTransfer) return false;
                } else {
                    return false;
                }
                b.previewData = [
                    { labelCode: 'nickname', displayedValue: b.nickname, id: 'nickname' },
                    { labelCode: 'bank_name', displayedValue: b.bank_name, id: 'bank-name' },
                    { labelCode: 'country', displayedValue: b.bank_country.country_code, id: 'country' },
                    { labelCode: 'account_number', displayedValue: b.account_number, id: 'account-no' }
                ];
                if (b.type === 'I') {
                    b.previewData[2].displayedValue = $filter('filter')($scope.countries, { 'country_code': b.bank_country.country_code })[0].country_name;
                    if (b.bank_country.country_iban) {
                        b.previewData[3].labelCode = 'iban';
                    } else {
                        b.previewData.push({ labelCode: b.bank_country.country_routing_code, displayedValue: b.routing_code, id: 'routing_code' });
                    }
                }
                if (b.type === 'B') {
                    b.previewData.push({ labelCode: 'currency', displayedValue: b.currency, id: 'currency' });
                }
                return true;
            });
        };

        $scope.select = {};

        var loadCurrencies = function() {
            if ($scope.fromAccount && $scope.toAccount) {
                $scope.currencies = null;
                $timeout(function() {
                    $scope.currencies = $scope.paymentType.currencyFilter($scope.fromAccount, $scope.toAccount);
                    if ($scope.currencies && $scope.currencies.length === 1) {
                        $scope.transferCurrency = $scope.currencies[0];
                    } else if ($scope.currencies && $scope.transferCurrency && $scope.currencies.indexOf($scope.transferCurrency) === -1) {
                        $scope.transferCurrency = null;
                    }
                }, 500);
            } else {
                $scope.currencies = null;
            }
        };

        $scope.chooseFromAccount = function(fromAccount) {
            if (!fromAccount) return;
            if ($scope.fromAccount && $scope.fromAccount.account_id && $scope.fromAccount.account_id === fromAccount.account_id) return;
            if ($scope.fromAccount && $scope.fromAccount.card_id && $scope.fromAccount.card_id === fromAccount.card_id) return;

            $scope.success = {};
            $scope.error = {};

            $scope.fromAccount = fromAccount;
            $scope.select.fromAcc = fromAccount;

            if (fromAccount.account_id && $scope.toAccount && $scope.toAccount.account_id && $scope.toAccount.account_id === fromAccount.account_id) {
                $scope.toAccount = null;
                $scope.select.toAcc = null;
            }
            if (fromAccount.card_id && $scope.toAccount && $scope.toAccount.card_id && $scope.toAccount.card_id === fromAccount.card_id) {
                $scope.toAccount = null;
                $scope.select.toAcc = null;
            }

            if (fromAccount.account_id)
                $scope.toAccountFiltered = $filter('filter')($filter('filter')(angular.copy($scope[$scope.paymentType.toCriteria.data]), $scope.paymentType.toCriteria.toFilter), { account_id: '!' + fromAccount.account_id });

            loadCurrencies();
        };

        var modalOpened = false;
        $scope.chooseToAccount = function(toAccount) {
            var lang = $scope.language.selectedId;

            if (!toAccount || modalOpened) {
                $scope.select.toAcc = null;
                return;
            }

            //CHECK FOR PENDING OR REJECTED BENEFICIARIES
            if (toAccount && toAccount.type == 'I' && toAccount.status == 'P') {
                $scope.toAccount = null;
                $scope.select.toAcc = null;
                // $scope.error.editBenefMsg = $filter('translate')('error_choose_benef_pending');
                return;
            } else if (toAccount && toAccount.type == 'I' && toAccount.status == 'R') {
                $scope.toAccount = null;
                $scope.select.toAcc = null;
                // $scope.error.editBenefMsg = $filter('translate')('error_choose_benef_rejected');
                return;
            }

            if ($scope.toAccount && $scope.toAccount.account_id && $scope.toAccount.account_id === toAccount.account_id) return;
            if ($scope.toAccount && $scope.toAccount.card_id && $scope.toAccount.card_id === toAccount.card_id) return;

            $scope.success = {};
            $scope.error = {};

            $scope.toAccount = toAccount;
            $scope.select.toAcc = toAccount;

            if (toAccount.account_id && $scope.fromAccount && $scope.fromAccount.account_id && $scope.fromAccount.account_id === toAccount.account_id) {
                $scope.fromAccount = null;
                $scope.select.fromAcc = null;
            }

            if (toAccount.account_id)
                $scope.fromAccountFiltered = $filter('filter')($filter('filter')(angular.copy($scope.accounts), $scope.paymentType.fromFilter), { account_id: '!' + toAccount.account_id });

            loadCurrencies();
            if (toAccount.card_id || toAccount.account_id) {
                // $scope.transferReason = 'credit card payment';
                $scope.hideReason = true;
            } else {
                $scope.hideReason = false;
            }

        };

        $scope.editBenef = function(benef) {
            if (modalOpened) return;
            $scope.success = {};
            if (!benef) return;
            var lang = $scope.language.selectedId;
            var banks = angular.copy($scope.banks);
            var disclaimer = benefDisclaimer;
            $scope.toAccount = null;
            $scope.select.toAcc = null;
            var countries = angular.copy($scope.countries);

            modalOpened = true;
            var editModal = $uibModal.open({
                templateUrl: "app/components/transfers/edit_benef_modal.html",

                controller: function($scope, $http, $uibModalInstance, Messages) {
                    $scope.benef = angular.copy(benef);
                    $scope.banks = banks;
                    $scope.benefDisclaimer = disclaimer;
                    $scope.countryName = $filter('filter')(countries, { 'country_code': $scope.benef.bank_country_code })[0].country_name;

                    $scope.cancel = function() {
                        $uibModalInstance.dismiss();
                    };
                    $scope.bankSelected = function(bank) {
                        if (!bank) return;
                        $scope.beneficiaryBank = bank;
                        $scope.benef.bank = $filter('filter')($scope.banks, { bic: bank }, true)[0];
                    };
                    $scope.bankSelected(benef.bank_swift);

                    $scope.save = function() {

                        if (!$scope.benef.account_number || !$scope.benef.nickname ||
                            !$scope.benef.rcpt_first_name || !$scope.benef.rcpt_last_name ||
                            !$scope.benef.bank) {
                            $scope.errorMessage = Messages.getMessage('missing_field', lang);
                            return;
                        }

                        if (/[\u0600-\u06FF]/.test($scope.benef.nickname) ||
                            /[\u0600-\u06FF]/.test($scope.benef.rcpt_first_name) ||
                            /[\u0600-\u06FF]/.test($scope.benef.rcpt_last_name)) {
                            $scope.errorMessage = Messages.getMessage('beneficiary_arabic', lang);
                            return;
                        }

                        var body = [{
                            beneficiary_id: benef.beneficiary_id,
                            account_number: $scope.benef.account_number,
                            nickname: $scope.benef.nickname,
                            type: $scope.benef.bank.type,
                            // bank_swift: $scope.benef.bank.bic,
                            // bank_address_1: $scope.benef.bank.address1,
                            // bank_address_2: $scope.benef.bank.address2,
                            // bank_country_code: $scope.benef.bank.country_code,
                            // bank_name: $scope.benef.bank.name,
                            rcpt_first_name: $scope.benef.rcpt_first_name,
                            rcpt_last_name: $scope.benef.rcpt_last_name,
                            routing_code: $scope.benef.routing_code,
                            rcpt_address_1: $scope.benef.rcpt_address_1,
                            rcpt_address_2: $scope.benef.rcpt_address_2,
                            rcpt_address_3: $scope.benef.rcpt_address_3
                        }];
                        $scope.waiting = true;
                        $http.patch('/txn/beneficiary', body)
                            .then(function() {
                                $scope.waiting = false;
                                $uibModalInstance.close();
                            }, function(err) {
                                $scope.waiting = false;
                                if (err.data && err.data.code)
                                    $scope.errorMessage = Messages.getMessage(err.data.code, lang);
                                else if (err.data && err.data.code === '')
                                    $scope.errorMessage = Messages.getMessage('generic_error', $scope.language.selectedId);
                            });
                    };
                    $scope.delete = function() {
                        var titleMsg = $filter('translate')('delete');
                        var bodyMsg = Messages.getMessage('delete_ben_conf', lang);
                        var confModal = $uibModal.open({
                            templateUrl: "app/shared/views/confirmation_modal.html",
                            windowClass: 'zindex',
                            windowTopClass: 'zindex',
                            controller: function($scope, $uibModalInstance) {
                                $scope.titleMsg = titleMsg;
                                $scope.bodyMsg = bodyMsg;
                                $scope.cancel = function() {
                                    $uibModalInstance.dismiss();
                                };

                                $scope.done = function() {
                                    $uibModalInstance.close();
                                };
                            }
                        });
                        confModal.result.then(function() {
                            $scope.waiting = true;
                            $http.delete('/txn/beneficiary/' + benef.beneficiary_id)
                                .then(function() {
                                    $scope.waiting = false;
                                    $uibModalInstance.close();
                                }, function(err) {
                                    $scope.waiting = false;
                                    if (err.data && err.data.code)
                                        $scope.errorMessage = Messages.getMessage(err.data.code, lang);
                                    else if (err.data && err.data.code === '')
                                        $scope.errorMessage = Messages.getMessage('generic_error', lang);
                                });
                        });
                    };
                    $scope.done = function() {
                        $uibModalInstance.close();
                    };

                }
            });
            editModal.result.then(function() {
                modalOpened = false;
                // reloadBeneficiaries(benef.beneficiary_id);
                reloadBeneficiaries(null, function() {
                    $scope.toAccountFiltered = $filter('filter')(angular.copy($scope.beneficiaries), $scope.paymentType.toCriteria.toFilter);
                });
                $scope.toAccount = null;
                $scope.select.toAcc = null;
                $scope.success.editBenefMsg = Messages.getMessage('settings_success', $scope.language.selectedId);
            }, function() {
                $scope.toAccount = null;
                $scope.select.toAcc = null;
                modalOpened = false;
            });
        };

        $scope.addBenef = function(paymentType) {
            if (modalOpened) return;
            $scope.success = {};

            var lang = $scope.language.selectedId;
            var banks = $filter('filter')(angular.copy($scope.banks), paymentType.toCriteria.bankFilter);
            var accNoMaxLength = paymentType.toCriteria.accNoMaxLength;
            var disclaimer = benefDisclaimer;
            var countries = angular.copy($scope.countries);

            modalOpened = true;
            var editModal = $uibModal.open({
                templateUrl: "app/components/transfers/add_benef_modal.html",
                controller: function($scope, $http, $uibModalInstance, Messages, Settings) {
                    $scope.benef = {};
                    $scope.paymentType = paymentType;
                    $scope.banks = banks;
                    $scope.countries = countries;
                    $scope.countrySelect = false;
                    $scope.beneficiaryCountryName = "";
                    $scope.swift = {
                        known: false,
                        code: ""
                    }

                    $scope.checkChar = function(input, field) {
                        var char = input.slice(-1);
                        if ($scope.benef_allowed_chars.indexOf(char) > -1) {
                            return true;
                        } else {
                            if (field == 'N')
                                $scope.benef.nickname = $scope.benef.nickname.substring(0, $scope.benef.nickname.length() - 1);
                            if (field == 'F')
                                $scope.benef.rcpt_first_name = $scope.benef.rcpt_first_name.substring(0, $scope.benef.rcpt_first_name.length() - 1);
                            if (field == 'L')
                                $scope.benef.rcpt_last_name = $scope.benef.rcpt_last_name.substring(0, $scope.benef.rcpt_last_name.length() - 1);
                        }

                    };

                    $scope.benef_allowed_chars = (function() {
                        var regexp = /^\(?(\d{3})\)?[ .-]?(\d{3})[ .-]?(\d{4})$/;
                        return {
                            test: function(value) {
                                if ($scope.requireTel === false) {
                                    return true;
                                }
                                return regexp.test(value);
                            }
                        };
                    })();


                    if ($scope.banks.length === 1) {
                        $scope.benef.bank = banks[0];
                        $scope.beneficiaryBankName = banks[0].name;
                    }

                    if (['domestic_benef'].indexOf(paymentType.code) !== -1)
                        $scope.benefDisclaimer = disclaimer;

                    if (accNoMaxLength)
                        $scope.accNoMaxLength = accNoMaxLength;

                    $scope.cancel = function() {
                        $uibModalInstance.dismiss();
                    };

                    $scope.knowSwiftToggled = function() {
                        $scope.countries = countries;
                        $scope.banks = banks;
                        $scope.swift.code = "";
                        $scope.beneficiaryBankName = "";
                        $scope.beneficiaryCountryName = "";
                        $scope.beneficiaryCountry = null;
                        $scope.beneficiaryBank = null;
                        $scope.benef.country = null;
                        $scope.benef.bank = null;
                    };

                    $scope.swiftSelected = function() {
                        if ($scope.swift.code) {
                            $scope.banks = banks;
                            $scope.countries = countries;
                            $scope.banks = $filter('filter')($scope.banks, { 'bic': $scope.swift.code });
                            if ($scope.banks.length === 1) {
                                $scope.benef.bank = $scope.banks[0];
                                $scope.beneficiaryBankName = $scope.banks[0].name;
                            }
                            if ($scope.banks.length) {
                                $scope.countries = $filter('filter')($scope.countries, { 'country_code': $scope.banks[0].country_code });
                            }
                            if ($scope.countries.length === 1) {
                                $scope.benef.country = $scope.countries[0];
                                $scope.beneficiaryCountryName = $scope.countries[0].country_name;
                            }
                        } else {
                            $scope.countries = countries;
                            $scope.banks = banks;
                            $scope.swift.code = "";
                            $scope.beneficiaryBankName = "";
                            $scope.beneficiaryCountryName = "";
                        }
                    };

                    $scope.bankSelected = function(bank) {
                        if (!bank) return;
                        $scope.benef.bank = bank;
                        $scope.beneficiaryBankName = bank.name;
                    };

                    $scope.countrySelected = function(country) {
                        $scope.banks = banks;
                        $scope.banks = $filter('filter')($scope.banks, { "country_code": country.country_code });
                        if ($scope.banks.length == 0) {
                            $scope.banks = banks;
                            $scope.beneficiaryBank = null;
                            $scope.beneficiaryBankName = null;
                            $scope.countrySelect = false;
                            $scope.benef.country = null;
                            $scope.benef.bank = null;
                            return;
                        }
                        if ($scope.banks.length === 1) {
                            $scope.benef.bank = $scope.banks[0];
                            $scope.beneficiaryBankName = $scope.banks[0].name;
                        }
                        $scope.countrySelect = true;
                        $scope.benef.country = country;
                    };

                    $scope.save = function() {
                        if (!$scope.benef.account_number || !$scope.benef.nickname ||
                            !$scope.benef.rcpt_first_name || !$scope.benef.rcpt_last_name ||
                            !$scope.benef.bank) {
                            $scope.errorMsg = Messages.getMessage('missing_field', lang);
                            return;
                        }

                        if ($scope.paymentType.code == 'intl_benef' && !$scope.benef.rcpt_address_1) {
                            $scope.errorMsg = Messages.getMessage('missing_field', lang);
                            return;
                        }

                        if (/[\u0600-\u06FF]/.test($scope.benef.nickname) ||
                            /[\u0600-\u06FF]/.test($scope.benef.rcpt_first_name) ||
                            /[\u0600-\u06FF]/.test($scope.benef.rcpt_last_name)) {
                            $scope.errorMsg = Messages.getMessage('beneficiary_arabic', lang);
                            return;
                        }

                        if ($scope.paymentType.code == 'intl_benef' && $scope.benef.country.iban) {
                            if (!checkIBAN($scope.benef.account_number)) {
                                $scope.errorMsg = $filter('translate')('error_iban');
                                return;
                            }
                        }

                        var body = [];
                        if ($scope.paymentType.code != 'intl_benef') {
                            var body = [{
                                currency: 'OMR',
                                account_number: $scope.benef.account_number,
                                nickname: $scope.benef.nickname,
                                type: $scope.benef.bank.type,
                                bank_swift: $scope.benef.bank.bic,
                                bank_address_1: $scope.benef.bank.address1,
                                bank_address_2: $scope.benef.bank.address2,
                                bank_country_code: $scope.benef.bank.country_code,
                                bank_name: $scope.benef.bank.name,
                                rcpt_first_name: $scope.benef.rcpt_first_name,
                                rcpt_last_name: $scope.benef.rcpt_last_name
                            }];
                        } else {
                            var body = [{
                                currency: 'OMR',
                                account_number: $scope.benef.account_number,
                                nickname: $scope.benef.nickname,
                                type: $scope.benef.bank.type,
                                bank_swift: $scope.benef.bank.bic,
                                bank_address_1: $scope.benef.bank.address1,
                                bank_address_2: $scope.benef.bank.address2,
                                bank_country_code: $scope.benef.bank.country_code,
                                bank_name: $scope.benef.bank.name,
                                rcpt_first_name: $scope.benef.rcpt_first_name,
                                rcpt_last_name: $scope.benef.rcpt_last_name,
                                routing_code: $scope.benef.routing_code,
                                rcpt_address_1: $scope.benef.rcpt_address_1,
                                rcpt_address_2: $scope.benef.rcpt_address_2,
                                rcpt_address_3: $scope.benef.rcpt_address_3
                            }];
                        }

                        $scope.waiting = true;
                        $http.post('/txn/beneficiary', body)
                            .then(function() {
                                $scope.waiting = false;
                                $uibModalInstance.close();
                            }, function(err) {
                                $scope.waiting = false;
                                if (err.data && err.data.code)
                                    $scope.errorMsg = Messages.getMessage(err.data.code, lang);
                                if (!$scope.errorMsg)
                                    $scope.errorMsg = Messages.getMessage('generic_error', lang);
                            });
                    };
                    $scope.done = function() {
                        $uibModalInstance.close();
                    };

                }
            });
            editModal.result.then(function() {
                modalOpened = false;
                // reloadBeneficiaries(benef.beneficiary_id);
                reloadBeneficiaries(null, function() {
                    $scope.toAccountFiltered = $filter('filter')(angular.copy($scope[paymentType.toCriteria.data]), paymentType.toCriteria.toFilter);
                });
                $scope.success.editBenefMsg = Messages.getMessage('settings_success', $scope.language.selectedId);
            }, function() {
                modalOpened = false;
            });
        };

        // reload beneficiaries and select benefId if available
        var reloadBeneficiaries = function(benefId, success) {
            $http.get('/txn/beneficiary')
                .success(function(data) {
                    TransferData.data.beneficiaries = data;
                    arrangeBenefs(data);
                    if (benefId)
                        $scope.toAccount = $filter('filter')($scope.beneficiaries, { beneficiary_id: benefId }, true)[0];
                    if (success) success();
                });
        };

        $q.all([
                Settings.getData(),
                Messages.getData()
            ]).then(function() {
                $scope.base_currency = Settings.getSetting('base_currency', 'global').value;
                //Verification Settings for Bulk Transfer
                benef_allowed_characters = Settings.getSetting('benef_allowed_characters', 'transfer').value;
                benef_maximum_characters = Settings.getSetting('benef_maximum_characters', 'transfer').value;
                reason_maximum_characters = Settings.getSetting('reason_maximum_characters', 'transfer').value;
                reason_allowed_characters = Settings.getSetting('reason_allowed_characters', 'transfer').value;
                benef_acc_num_allowed_characters = Settings.getSetting('benef_acc_num_allowed_characters', 'transfer').value;
                benef_acc_num_maximum_characters = Settings.getSetting('benef_acc_num_maximum_characters', 'transfer').value;

                // Messages
                accountsListEmptyMsg = Messages.getMessage('accounts_list_empty', $scope.language.selectedId);
                beneficiaryListEmptyMsg = Messages.getMessage('beneficiary_list_empty', $scope.language.selectedId);
                cardsListEmptyMsg = Messages.getMessage('cards_list_empty', $scope.language.selectedId);
                benefDisclaimer = Messages.getMessage('domestic_beneficiary', $scope.language.selectedId);
                domesticTransferMsg = Messages.getMessage('domestic_transfer', $scope.language.selectedId);
                intlTransferMsg = Messages.getMessage('swift_transfer', $scope.language.selectedId);
                $scope.titleMsg = Messages.getMessage('where_to_transfer', $scope.language.selectedId);
                $scope.bulk_instruction = Messages.getMessage('bulk_transf_file_instruc', $scope.language.selectedId);

                //Verification Bulk Sheet
                verificationErrorMessages = {
                    "benef_allowed_characters": Messages.getMessage('benef_allowed_char', $scope.language.selectedId),
                    "benef_maximum_characters": Messages.getMessage('benef_maximum_char_msg', $scope.language.selectedId).replace('{benef_maximum_characters}', benef_maximum_characters),
                    "reason_allowed_characters": Messages.getMessage('TransferReasonAllowedCharacters', $scope.language.selectedId).replace("{allowed_characters}", reason_allowed_characters),
                    "reason_maximum_characters": Messages.getMessage('TransferReasonMaxLength', $scope.language.selectedId).replace("{number}", reason_maximum_characters),
                    "benef_acc_num_allowed_characters": Messages.getMessage('benef_acc_num_allowed_char_msg', $scope.language.selectedId),
                    "benef_acc_num_maximum_characters": Messages.getMessage('benef_acc_num_maximum_char_msg', $scope.language.selectedId).replace('{benef_acc_num_maximum_characters}', benef_acc_num_maximum_characters),
                }

                return TransferData.getData($scope.language.selectedId);
            }, function() {
                return TransferData.getData($scope.language.selectedId);
            })
            .then(function(data) {
                $scope.allBanks = data.banks;
                $scope.banks = $filter('orderBy')($filter('orderBy')(
                    $filter('filter')(data.banks, function(item) {
                        if (item.type === 'B' && hasBnkTransfer) return true;
                        if (item.type === 'D' && hasDomTransfer) return true;
                        if (item.type === 'I' && hasIntTransfer) return true;
                        return false;
                    }), 'name', true), function(item) {
                    return item.type === 'B';
                }, true);

                $scope.myBank = $filter('filter')($scope.banks, { 'type': 'B' })[0];
                $scope.countries = data.countries;

                $scope.reasons = $filter('orderBy')(Messages.getMessages('transfer_reasons', $scope.language.selectedId), function(a) {
                    return a.string_id !== 'other';
                }, true);

                $scope.share_types = [{ name: $filter('translate')('share_our'), value: "O" }, { name: $filter('translate')('share_ben'), value: "B" }, { name: $filter('translate')('share_sha'), value: "S" }];

                arrangeBenefs(data.beneficiaries);

                $scope.accounts = [];

                angular.forEach(JSON.parse(JSON.stringify(data.accounts)), function(a) {
                    // TODO: move logic into Accounts service
                    if (a.account_type && [0, 1, 6].indexOf(a.account_type.type) !== -1) {
                        a.labelCode = 'available_balance';
                        a.displayedValue = $filter('currency')(a.balance_available, a.currency);
                    } else if (a.account_type && [5].indexOf(a.account_type.type) !== -1) {
                        a.labelCode = 'outstanding_balance';
                        a.displayedValue = $filter('currency')(a.amount_outstanding, a.currency);
                    }
                    a.displayedName = Accounts.displayedName(a, $scope.language.selectedId);
                    a.info1 = a.account_no;

                    a.previewData = [];
                    if (a.pref_nickname) {
                        a.previewData.push({ labelCode: 'nickname', displayedValue: a.pref_nickname, id: 'nickname' });
                    } else if (a.account_type && a.account_type.name) {
                        a.previewData.push({ labelCode: 'name', displayedValue: Messages.getMessage(a.account_type.name, $scope.language.selectedId), id: 'name' });
                    }
                    a.previewData.push({ labelCode: 'account_number', displayedValue: a.account_no, id: 'account-no' });
                    a.previewData.push({ labelCode: a.labelCode, displayedValue: a.displayedValue, ngClass: 'account-balance-cell', id: 'balance' });

                    if (a.pref_display)
                        $scope.accounts.push(a);
                });
                angular.forEach(JSON.parse(JSON.stringify(data.cards)), function(c) {
                    // TODO: move logic into Accounts service
                    if (c.card_type && c.card_type.category === 1) {
                        c.labelCode = 'next_payment_due_amount';
                        c.displayedValue = $filter('currency')(c.minimum_due, c.currency);
                    } else if (c.card_type && c.card_type.category === 0) {
                        c.labelCode = 'available_withdrawal_limit';
                        c.displayedValue = $filter('currency')(c.remaining_limit, c.currency);
                    }
                    c.displayedName = Accounts.displayedName(c, $scope.language.selectedId);
                    c.info1 = c.masked_card_no;

                    c.previewData = [];
                    if (c.pref_nickname) {
                        c.previewData.push({ labelCode: 'nickname', displayedValue: c.pref_nickname, id: 'nickname' });
                    } else if (c.card_type && c.card_type.type) {
                        c.previewData.push({ labelCode: 'name', displayedValue: Messages.getMessage(c.card_type.type, $scope.language.selectedId), id: 'name' });
                    }
                    c.previewData.push({ labelCode: 'card_number_placeholder', displayedValue: c.masked_card_no, id: 'card-no' });

                    if (c.amount_due || c.amount_due === 0)
                        c.previewData.push({ labelCode: 'amount_due', displayedValue: $filter('currency')(c.amount_due, c.currency), ngClass: 'account-balance-cell', id: 'amount-due' });


                    if (c.pref_display)
                        $scope.accounts.push(c);
                });
                $scope.pageLoading = false;

                loadPaymentTypes();

                if (SelectedPaymentData.type && paymentTypeCodes.indexOf(SelectedPaymentData.type) !== -1) {
                    $scope.paymentTypeChanged($filter('filter')($scope.paymentTypes, function(t) {
                        return t.code === SelectedPaymentData.type;
                    })[0], true);
                } else {
                    $scope.paymentTypeChanged($scope.paymentTypes[0]);
                }
            }, function() {});

        var otpModalOpened = false;
        var verifyOtp = function(otpId, transferId) {
            if (otpModalOpened) return;
            var showLogs = $scope.showLogs;
            var lang = $scope.language.selectedId;
            otpModalOpened = true;
            var otpModal = $uibModal.open({
                templateUrl: "app/shared/views/otp_modal.html",
                controller: function($scope, $uibModalInstance, Settings, $filter) {
                    var otpLength = 4;
                    $scope.otpValue = null;

                    $scope.countDown = -1;
                    var startCountDown = function() {
                        $scope.otpExpired = false;
                        $scope.countDown = $scope.otpExpiryTime;
                        if ($scope.myCountDown) {
                            $timeout.cancel($scope.myCountDown);
                        }
                        $scope.onTimeout = function() {
                            $scope.countDown--;
                            if ($scope.countDown > 0) {
                                $scope.myCountDown = $timeout($scope.onTimeout, 1000);
                            } else {
                                $scope.otpExpired = true;
                            }
                        };
                        $scope.myCountDown = $timeout($scope.onTimeout, 1000);
                    };
                    Settings.getData()
                        .then(function() {

                            otpLength = Settings.getSetting('otp_length', 'otp').value;

                            var otpExpiry = Settings.getSetting('otp_ttl', 'otp');
                            if (otpExpiry && otpExpiry.value) {
                                // in minutes
                                $scope.otpExpiryTime = otpExpiry.value * 60 - 1;
                            } else {
                                $scope.otpExpiryTime = 5 * 60 - 1;
                            }
                            startCountDown();
                        });

                    $scope.resetTimerWithTimeout = function() {
                        $scope.countDown = $scope.otpExpiryTime;
                        $timeout.cancel($scope.myCountDown);
                    };
                    $scope.resendOTP = function() {
                        $scope.waiting = true;
                        console.log("RESEND OTP, otp_id: " + otpId);
                        $http.post('/txn/transfer/resend_otp/' + transferId)
                            .success(function() {
                                $scope.waiting = false;
                                $scope.errorMessage = null;
                                $scope.resendOtpMessage = Messages.getMessage('new_otp_sent', lang);
                                startCountDown();
                            })
                            .error(function() {
                                $scope.waiting = false;
                            });
                    };
                    $scope.done = function() {
                        if (!$scope.otpValue) return;
                        $scope.waiting = true;
                        $http.post('/txn/transfer/verify_otp', { transfer_id: transferId, otp_value: $scope.otpValue })
                            .success(function(data) {
                                $scope.waiting = false;
                                if (showLogs) console.log("transfer verify otp result", data);
                                if (data.status && data.status === 'O') {
                                    $scope.errorMessage = Messages.getMessage('otp_wrong', lang) || $filter('translate')('generic_error');
                                } else if (data.status && data.status !== 'O') {
                                    $uibModalInstance.close(data);
                                }
                            })
                            .error(function(err) {
                                $scope.waiting = false;
                                if (showLogs) console.log("transfer verify otp error", err);
                                if (err && err.code) {
                                    $scope.errorMessage = Messages.getMessage(err.code, lang);
                                } else {
                                    $scope.errorMessage = Messages.getMessage('otp_wrong', lang);
                                }
                            });
                    };
                    $scope.cancel = function() {
                        $uibModalInstance.dismiss();
                    };
                }
            });
            otpModal.result.then(function(newTransfer) {
                otpModalOpened = false;
                if (!newTransfer.transfer_id) {
                    $scope.error.step2Msg = $filter('translate')('transfer_add_error');
                } else {
                    $scope.transferStatus = newTransfer.status;
                    $scope.step = 3;
                    $scope.toTheTop();
                    if (newTransfer.status === 'P')
                        $scope.transferSuccessMsg = Messages.getMessage(($scope.currentUser.customer_type === 'C') ? 'pending_approval_corp' : 'pending_approval_joint', $scope.language.selectedId);
                    else
                        $scope.transferSuccessMsg = $filter('translate')('transfer_successfully_submitted');

                    Transactions.resourcesLoaded = false;
                    $rootScope.$broadcast('reloadAlerts');
                    Accounts.resourcesLoaded = false;
                    ActivityService.resourcesLoaded = false;

                    if (newTransfer.trf_type === 'D') {
                        $scope.transferDisclaimer = domesticTransferMsg;
                    } else if (newTransfer.trf_type === 'I') {
                        $scope.transferDisclaimer = intlTransferMsg;
                    }
                }
            }, function() {
                otpModalOpened = false;
            });
        };

        //FOR BULK TRANSFER
        var getTransferFees = function() {
            if ($scope.showLogs) console.log($scope.currentUser);
            $http.get('/api/integration/transfer_fees', {
                    params: {
                        'customer_id': Auth.getCustomerId(),
                        'trf_type': 'D'
                    }
                })
                .success(function(data) {
                    var single_transfer_fees = data.fees;
                    $scope.transfer_fees = 0;
                    for (var i = 0; i < $scope.jsonBulk.length; i++) {
                        if ($scope.jsonBulk[i]['Beneficiary Bank Code'] != $scope.myBank.bic) {
                            $scope.transfer_fees += single_transfer_fees;
                        }
                    }
                    $scope.total_amount = $scope.transfer_fees + parseFloat($scope.transferAmount);
                    $scope.showAddFees = true;
                });
        };

        //FOR BULK TRANSFER
        var postBulkOtp = function() {
            OTP.generateOtp($scope.jsonBulk.length, '/txnbanking/v1/bulk_transfer')
                .then(function(res) {
                    if (res.data && res.data.otp_id) {
                        verifyOTPForBulk(res.data.otp_id);
                    }
                });
        };

        //FOR BULK TRANSFER
        var otpModalOpened = false;
        var verifyOTPForBulk = function(otpId, paymentId) {
            if (otpModalOpened) return;
            var showLogs = $scope.showLogs;
            var lang = $scope.language.selectedId;
            otpModalOpened = true;
            $scope.toTheTop = $scope.toTheTop;
            var otpModal = $uibModal.open({
                templateUrl: "app/shared/views/otp_modal.html",
                controller: function($scope, $uibModalInstance, Settings, $filter, OTP, $q) {
                    var otpLength = 4;
                    $scope.otpValue = null;

                    $scope.countDown = -1;
                    var startCountDown = function() {
                        $scope.otpExpired = false;
                        $scope.countDown = $scope.otpExpiryTime;
                        if ($scope.myCountDown) {
                            $timeout.cancel($scope.myCountDown);
                        }
                        $scope.onTimeout = function() {
                            $scope.countDown--;
                            if ($scope.countDown > 0) {
                                $scope.myCountDown = $timeout($scope.onTimeout, 1000);
                            } else {
                                $scope.otpExpired = true;
                            }
                        };
                        $scope.myCountDown = $timeout($scope.onTimeout, 1000);
                    };
                    Settings.getData()
                        .then(function() {

                            otpLength = Settings.getSetting('otp_length', 'otp').value;

                            var otpExpiry = Settings.getSetting('otp_ttl', 'otp');
                            if (otpExpiry && otpExpiry.value) {
                                // in minutes
                                $scope.otpExpiryTime = otpExpiry.value * 60 - 1;
                            } else {
                                $scope.otpExpiryTime = 5 * 60 - 1;
                            }
                            startCountDown();
                        });

                    $scope.resetTimerWithTimeout = function() {
                        $scope.countDown = $scope.otpExpiryTime;
                        $timeout.cancel($scope.myCountDown);
                    };

                    $scope.resendOTP = function() {
                        $scope.waiting = true;
                        console.log("RESEND OTP, otp_id: " + otpId);
                        OTP.generateOtp(bills.length, '/payment/v1/payment')
                            .then(function(res) {
                                if (res.data && res.data.otp_id) {
                                    otpId = res.data.otp_id;
                                    $scope.waiting = false;
                                    $scope.resendOtpMessage = Messages.getMessage('new_otp_sent', lang);
                                    startCountDown();
                                }
                            }, function() {
                                $scope.waiting = false;
                            });
                    };

                    $scope.done = function() {
                        if (!$scope.otpValue) return;
                        $scope.waiting = true;
                        OTP.verifyOtp(otpId, $scope.otpValue)
                            .then(function(res) {
                                $scope.waiting = false;
                                postBulkTransfer(otpId);
                                $uibModalInstance.close();
                            })


                    };
                    $scope.cancel = function() {
                        $uibModalInstance.dismiss();
                    };
                }
            });
        };

        //FOR BULK TRANSFER
        var postBulkTransfer = function(otp) {
            if ($scope.waitingTrf) return;
            $scope.error.step2Msg = null;

            if ($scope.showLogs) console.log("post transfer body", body);
            $scope.waitingTrf = true;
            $http.post('/txn/bulk_transfer', $scope.fileData, {
                    params: {
                        'from_account_id': $scope.fromAccount.account_id,
                        'total_amount': parseFloat($scope.transferAmount),
                        'device_uid': uniqueIdentifier,
                        'otp_id': otp
                    }
                })
                .success(function(data) {
                    if ($scope.showLogs) console.log("post transfer result", data);
                    $scope.waitingTrf = false;

                    $scope.transferStatus = data.status;
                    $scope.step = 3;
                    if (data && data.bulk_transfer_details.length) {
                        $scope.jsonBulk.map(function(transfer, index) {
                            transfer.returned_status = data.bulk_transfer_details[index].status;
                            return transfer;
                        });
                    } else {
                        $scope.error.step2Msg = Messages.getMessage('generic_error', $scope.language.selectedId);
                        return;
                    }

                    $scope.toTheTop();
                    Transactions.resourcesLoaded = false;
                    $rootScope.$broadcast('reloadAlerts');
                    Accounts.resourcesLoaded = false;
                    ActivityService.resourcesLoaded = false;

                    if (data.status === 'P') {
                        $scope.transferSuccessMsg = Messages.getMessage(($scope.currentUser.customer_type === 'C') ? 'pending_approval_corp' : 'pending_approval_joint', $scope.language.selectedId);
                    } else
                        $scope.transferSuccessMsg = $filter('translate')('transfer_successfully_submitted');

                    if (data.trf_type === 'D')
                        $scope.transferDisclaimer = domesticTransferMsg;

                })
                .error(function(err) {
                    if ($scope.showLogs) console.log("post bulk transfer error", err);
                    $scope.waitingTrf = false;
                    if (err && err.code)
                        $scope.error.step2Msg = Messages.getMessage(err.code, $scope.language.selectedId);
                    if (!$scope.error.step2Msg)
                        $scope.error.step2Msg = Messages.getMessage('generic_error', $scope.language.selectedId);
                });
        };

        var postTransfer = function() {
            if ($scope.waitingTrf) return;
            $scope.error.step2Msg = null;
            var body = {
                from_account_id: $scope.fromAccount.account_id,
                "amount": parseFloat($scope.transferAmount),
                "currency": $scope.transferCurrency,
                // "note": $scope.transferNotes || '',
                "device_uid": uniqueIdentifier
            };
            if (!$scope.hideReason) {
                body.reason = Messages.getMessage($scope.transferReason, 'en');
                if ($scope.transferReason === 'other') {
                    body.note = $scope.transferCustomReason;
                }
                if ($scope.paymentType.code == 'intl_benef' && $scope.transferShareType) {
                    body.share_type = $scope.transferShareType;
                }
            }

            if ($scope.toAccount.ib_type === 'account') {
                body.to_account_id = $scope.toAccount.account_id;
            } else if ($scope.toAccount.ib_type === 'card') {
                body.to_card_id = $scope.toAccount.card_id;
            } else if ($scope.toAccount.beneficiary_id) {
                body.beneficiary_id = $scope.toAccount.beneficiary_id;
            }

            if ($scope.showLogs) console.log("post transfer body", body);
            $scope.waitingTrf = true;
            $http.post('/txn/transfer', body)
                .success(function(data) {
                    if ($scope.showLogs) console.log("post transfer result", data);
                    $scope.waitingTrf = false;
                    if (data && data.otp_id && data.status === 'O') {
                        verifyOtp(data.otp_id, data.transfer_id);
                    } else if (data && data.status && data.transfer_id) {
                        $scope.transferStatus = data.status;
                        $scope.step = 3;

                        $scope.toTheTop();
                        Transactions.resourcesLoaded = false;
                        $rootScope.$broadcast('reloadAlerts');
                        Accounts.resourcesLoaded = false;
                        ActivityService.resourcesLoaded = false;

                        if (data.status === 'P') {
                            $scope.transferSuccessMsg = Messages.getMessage(($scope.currentUser.customer_type === 'C') ? 'pending_approval_corp' : 'pending_approval_joint', $scope.language.selectedId);
                        } else
                            $scope.transferSuccessMsg = $filter('translate')('transfer_successfully_submitted');

                        if (data.trf_type === 'D') {
                            $scope.transferDisclaimer = domesticTransferMsg;
                        } else if (data.trf_type === 'I') {
                            $scope.transferDisclaimer = intlTransferMsg;
                        }
                    } else {
                        $scope.error.step2Msg = Messages.getMessage('generic_error', $scope.language.selectedId);
                    }
                })
                .error(function(err) {
                    if ($scope.showLogs) console.log("post transfer error", err);
                    $scope.waitingTrf = false;
                    if (err && err.code)
                        $scope.error.step2Msg = Messages.getMessage(err.code, $scope.language.selectedId);
                    if (!$scope.error.step2Msg)
                        $scope.error.step2Msg = Messages.getMessage('generic_error', $scope.language.selectedId);
                });
        };

        $scope.cancel = function() {
            reset();
        };

        $scope.next = function() {
            $scope.error.step1Msg = null;
            if ($scope.step !== 1) return;

            if (!$scope.fromAccount || !$scope.toAccount || !$scope.transferAmount || !$scope.transferCurrency) {
                $scope.error.step1Msg = Messages.getMessage('missing_field', $scope.language.selectedId);
                return;
            }

            if (!$scope.hideReason && !$scope.transferReason) {
                $scope.error.step1Msg = Messages.getMessage('missing_field', $scope.language.selectedId);
                return;
            }


            // var amountPattern = /^[0-9]{0,10}$/;
            // if (!amountPattern.test($scope.transferAmount) || $scope.transferAmount === 0 || isNaN($scope.transferAmount)) {
            if (isNaN($scope.transferAmount)) {
                $scope.error.step1Msg = Messages.getMessage('bill_amount_out_range', $scope.language.selectedId);
                return;
            }

            if ($scope.fromAccount.balance_available <= 0 || $scope.transferAmount > $scope.fromAccount.balance_available) {
                $scope.error.step1Msg = Messages.getMessage('insufficient_balance', $scope.language.selectedId);
                return;
            }

            if ($scope.transferReason && $scope.transferReason === 'other' && !$scope.transferCustomReason) {
                $scope.error.step1Msg = Messages.getMessage('missing_field', $scope.language.selectedId);
                return;
            }

            if ($scope.transferReason && $scope.transferReason === 'other' && /[\u0600-\u06FF]/.test($scope.transferCustomReason)) {
                $scope.error.step1Msg = Messages.getMessage('reason_arabic', $scope.language.selectedId);
                return;
            }

            if ($scope.transferReason)
                $scope.transferReasonObj = $filter('filter')($scope.reasons, { string_id: $scope.transferReason }, 1)[0];

            uniqueIdentifier = randomString(32, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
            if ($scope.jsonBulk && $scope.jsonBulk.length) getTransferFees();
            $scope.step = 2;
            $scope.error.step2Msg = null;
        };
        $scope.confirm = function() {
            if ($scope.step !== 2) return;
            if ($scope.paymentType.code === 'bulk') {
                postBulkOtp();
                return;
            }
            postTransfer();
        };
        $scope.back = function() {
            if ($scope.step !== 2) return;
            $scope.step = 1;
        };
        $scope.currencySelected = function(c) {
            if (!c) return;
            $scope.transferCurrency = c;
        };
        $scope.reasonSelected = function(r) {
            if (!r) return;
            $scope.transferReason = r;
        };
        $scope.shareTypeSelected = function(s) {
            if (!s) return;
            $scope.transferShareType = s.value;
            $scope.transferShareTypeName = s.name;
        };


        var oldValue = null;
        var validAmount = function(amount) {
            return !isNaN(amount) && ((('' + amount).split('.')[1] || []).length <= 3);
        };

        $scope.amountChanged = function() {
            if (validAmount($scope.transferAmount)) {
                oldValue = $scope.transferAmount;
            } else if (oldValue) {
                $scope.transferAmount = oldValue;
            } else {
                $scope.transferAmount = 0;
            }
        };

        $scope.$on('$destroy', function() {
            SelectedPaymentData.type = null;
            SelectedPaymentData.from_account_id = null;
            SelectedPaymentData.to_account_id = null;
            SelectedPaymentData.to_card_id = null;
            SelectedPaymentData.bill_id = null;
            SelectedPaymentData.benef_id = null;
        });

        //FOR BULK TRANSFER
        function mod97(string) {
            var checksum = string.slice(0, 2),
                fragment;

            for (var offset = 2; offset < string.length; offset += 7) {
                fragment = String(checksum) + string.substring(offset, offset + 7);
                checksum = parseInt(fragment, 10) % 97;
            }

            return checksum;
        }

        function checkIBAN(input) {
            // return a function that does the actual work
            var iban = String(input).toUpperCase().replace(/[^A-Z0-9]/g, ''), // keep only alphanumeric characters
                code = iban.match(/^([A-Z]{2})(\d{2})([A-Z\d]+)$/), // match and capture (1) the country code, (2) the check digits, and (3) the rest
                digits;

            // check syntax and length
            if (!code) {
                return false;
            }

            // rearrange country code and check digits, and convert chars to ints
            digits = (code[3] + code[1] + code[2]).replace(/[A-Z]/g, function(letter) {
                return letter.charCodeAt(0) - 55;
            });

            // final check
            return (mod97(digits) === 1);
        }

        $scope.downloadDocument = function() {
            var a = document.createElement('A');
            a.href = '/assets/files/bulk_transfer.xlsx';
            a.download = "bulk_transfer.xlsx";
            document.body.appendChild(a);
            a.click();
        };

        uploader.onAfterAddingFile = function(fileItem) {
            uploadDocument(fileItem);
        };

        function uploadDocument(file) {
            $scope.bulkErrorMessages = [];
            $scope.transferAmount = 0;
            var file = uploader.getNotUploadedItems();
            var reader = new FileReader();

            function readFile() {
                reader.onload = function(e) {
                    var data = reader.result;
                    $scope.$apply(function() {
                        $scope.fileData = data;
                        $scope.jsonBulk = csvToJSON(data);
                        if ($scope.jsonBulk === null) {
                            console.log("in heereeeee");
                            $scope.error.editBenefMsg = Messages.getMessage('sheet_error', $scope.language.selectedId);
                            return;
                        }
                        if ($scope.jsonBulk.hasError) {
                            $scope.error.editBenefMsg = Messages.getMessage('sheet_parsing_error', $scope.language.selectedId);
                        }
                        $scope.toAccount = $scope.jsonBulk;
                        for (var i = 0; i < $scope.jsonBulk.length; i++) {
                            $scope.transferAmount += parseFloat($scope.jsonBulk[i].Amount);
                        }
                        if (!$scope.jsonBulk.hasError) {
                            loadCurrencies();
                        }
                    });
                }
                reader.readAsText(file[0]._file);
            }
            readFile();
        };

        function CSVToArray(strData, strDelimiter) {
            strDelimiter = (strDelimiter || ",");
            var objPattern = new RegExp((
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
                "([^\"\\" + strDelimiter + "\\r\\n]*))"), "gi");
            var arrData = [
                []
            ];
            var arrMatches = null;
            while (arrMatches = objPattern.exec(strData)) {
                var strMatchedDelimiter = arrMatches[1];
                if (strMatchedDelimiter.length && (strMatchedDelimiter != strDelimiter)) {
                    arrData.push([]);
                }
                if (arrMatches[2]) {
                    var strMatchedValue = arrMatches[2].replace(
                        new RegExp("\"\"", "g"), "\"");
                } else {
                    var strMatchedValue = arrMatches[3];
                }
                arrData[arrData.length - 1].push(strMatchedValue);
            }
            return (arrData);
        }

        function csvToJSON(csv) {
            var array = CSVToArray(csv);
            var objArray = [];
            for (var i = 1; i < array.length; i++) {
                objArray[i - 1] = {};
                for (var k = 0; k < array[0].length && k < array[i].length; k++) {
                    var key = array[0][k];
                    objArray[i - 1][key] = array[i][k]
                }
            }
            objArray = verifyCSVcontent(objArray);

            return objArray;
        }

        //Verifying CSV FILE CONTENT
        function verifyCSVcontent(csv_content) {
            csv_content.hasError = false;
            for (var i = 0; i < csv_content.length; i++) {
                var hasError = false;
                csv_content[i].verification = {};

                if (csv_content[i]["Beneficiary Name"] === undefined || csv_content[i]["Transaction Purpose"] === undefined || csv_content[i]["Beneficiary Account Number"] === undefined) {
                    return null;
                }

                // Benef name
                for (var j = 0; j < csv_content[i]["Beneficiary Name"].length; j++) {
                    if (!benef_allowed_characters.includes(csv_content[i]["Beneficiary Name"][j])) {
                        var value = csv_content[i]["Beneficiary Name"];
                        csv_content[i].verification[value] = verificationErrorMessages["benef_allowed_characters"];
                        hasError = true;
                        break;
                    }
                }
                if (csv_content[i]["Beneficiary Name"].length > benef_maximum_characters) {
                    var value = csv_content[i]["Beneficiary Name"];
                    csv_content[i].verification[value] += '\n' + verificationErrorMessages["benef_maximum_characters"];
                    hasError = true;
                }

                // Transaction Purpose
                for (var j = 0; j < csv_content[i]["Transaction Purpose"].length; j++) {
                    if (!reason_allowed_characters.includes(csv_content[i]["Transaction Purpose"][j])) {
                        var value = csv_content[i]["Transaction Purpose"];
                        csv_content[i].verification[value] = verificationErrorMessages["reason_allowed_characters"];
                        hasError = true;
                        break;
                    }
                }
                if (csv_content[i]["Transaction Purpose"].length > reason_maximum_characters) {
                    var value = csv_content[i]["Transaction Purpose"];
                    csv_content[i].verification[value] += '\n' + verificationErrorMessages["reason_maximum_characters"];
                    hasError = true;
                }

                // Beneficiary Account Number
                for (var j = 0; j < csv_content[i]["Beneficiary Account Number"].length; j++) {
                    if (!benef_acc_num_allowed_characters.includes(csv_content[i]["Beneficiary Account Number"][j])) {
                        var value = csv_content[i]["Beneficiary Account Number"];
                        csv_content[i].verification[value] = verificationErrorMessages["benef_acc_num_allowed_characters"];
                        hasError = true;
                        break;
                    }
                }
                if (csv_content[i]["Beneficiary Account Number"].length > benef_acc_num_maximum_characters) {
                    var value = csv_content[i]["Beneficiary Account Number"];
                    csv_content[i].verification[value] += '\n' + verificationErrorMessages["benef_acc_num_maximum_characters"];
                    hasError = true;
                }

                if (hasError) {
                    csv_content.hasError = true;
                }
            }
            if ($scope.showLogs) console.log(csv_content);
            return csv_content;
        }

        function isNumeric(n) {
            return !isNaN(parseFloat(n)) && isFinite(n);
        }
    }
]);