'use strict';

/*
 * Transfer Service
 */

app.factory('TransferData', ['$rootScope', '$q', '$http', 'Accounts', function($rootScope, $q, $http, Accounts) {
    var service = {
        resourcesLoaded: false,
        resourcesLoading: false,
        data: {},

        getData: function(lang) {
            var res = $q.defer();
            if (service.resourcesLoaded && Accounts.resourcesLoaded) {
                res.resolve(service.data);
                return res.promise;
            }
            if (service.resourcesLoading) {
                $rootScope.$on('TransferDataLoaded', function() {
                    res.resolve(service.data);
                });
            }
            service.resourcesLoading = true;
            return $q.all([
                    Accounts.getData(lang),
                    $http.get('/txn/beneficiary'),
                    $http.get('/api/bank'),
                    $http.get('/api/country')
                ])
                .then(function(res) {
                    service.resourcesLoaded = true;
                    service.resourcesLoading = false;
                    service.data = {
                        accounts: res[0].accounts,
                        cards: res[0].cards,
                        beneficiaries: (!angular.isArray(res[1].data)) ? [] : res[1].data,
                        banks: (!angular.isArray(res[2].data)) ? [] : res[2].data,
                        countries: (!angular.isArray(res[3].data)) ? [] : res[3].data
                    };
                    $rootScope.$broadcast('TransferDataLoaded');
                    return service.data;
                });
        }
    };
    $rootScope.$on('AccountsUpdated', function() {
        service.resourcesLoaded = false;
    });
    return service;
}]);