<?php /* Smarty version 2.6.18, created on 2025-11-24 17:31:01
         compiled from zone-index-list.html */ ?>
<?php require_once(SMARTY_CORE_DIR . 'core.load_plugins.php');
smarty_core_load_plugins(array('plugins' => array(array('function', 't', 'zone-index-list.html', 20, false),array('function', 'rv_add_session_token', 'zone-index-list.html', 44, false),array('function', 'ox_column_class', 'zone-index-list.html', 69, false),array('function', 'ox_column_title', 'zone-index-list.html', 70, false),array('function', 'cycle', 'zone-index-list.html', 119, false),array('function', 'ox_zone_icon', 'zone-index-list.html', 130, false),array('function', 'ox_entity_id', 'zone-index-list.html', 134, false),array('function', 'ox_zone_size', 'zone-index-list.html', 137, false),array('function', 'ox_column_updated', 'zone-index-list.html', 140, false),array('modifier', 'count', 'zone-index-list.html', 87, false),array('modifier', 'escape', 'zone-index-list.html', 130, false),array('modifier', 'default', 'zone-index-list.html', 143, false),)), $this); ?>


<div class='tableWrapper'>
    <div class='tableHeader'>
        <ul class='tableActions'>
            <?php if ($this->_tpl_vars['canAdd']): ?>
            <li>
                <?php if ($this->_tpl_vars['affiliateId'] != -1): ?>
                <a href='zone-edit.php?affiliateid=<?php echo $this->_tpl_vars['affiliateId']; ?>
' class='inlineIcon iconZoneAdd'><?php echo $this->_plugins['function']['t'][0](['str' => 'AddNewZone'], $this);?>
</a>
                <?php else: ?>
                <span class='inlineIcon iconZoneAddDisabled'><?php echo $this->_plugins['function']['t'][0](['str' => 'AddNewZone'], $this);?>
</span>
                <?php endif; ?>
            </li>
            <?php endif; ?>
            <?php if ($this->_tpl_vars['canDelete']): ?>
            <li class='inactive activeIfSelected'>
                <a id='deleteSelection' href='#' class='inlineIcon iconDelete'><?php echo $this->_plugins['function']['t'][0](['str' => 'Delete'], $this);?>
</a>

                <?php echo '
                <script type=\'text/javascript\'>
                <!--

				$(\'#deleteSelection\').click(function(event) {
					event.preventDefault();

					if (!$(this).parents(\'li\').hasClass(\'inactive\')) {
						var ids = [];
						$(this).parents(\'.tableWrapper\').find(\'.toggleSelection input:checked\').each(function() {
							ids.push(this.value);
						});

						if (!tablePreferences.warningBeforeDelete || confirm("'; ?>
<?php echo $this->_plugins['function']['t'][0](['str' => 'ConfirmDeleteZones'], $this);?>
<?php echo '")) {
							window.location = \'zone-delete.php?affiliateid='; ?>
<?php echo $this->_tpl_vars['affiliateId']; ?>
&<?php echo $this->_plugins['function']['rv_add_session_token'][0]([], $this);?>
<?php echo '&zoneid=\' + ids.join(\',\');
						}
					}
				});

				//-->
				</script>
                '; ?>

            </li>
            <?php endif; ?>
        </ul>

        <div class='clear'></div>
        <div class='corner left'></div>
        <div class='corner right'></div>
    </div>

    <table cellspacing='0' summary=''>
        <thead>
            <tr>
                <?php if ($this->_tpl_vars['canDelete']): ?>
                <th class='first toggleAll'>
                  <input type='checkbox' />
                </th>
                <?php endif; ?>
                <th class='<?php echo $this->_plugins['function']['ox_column_class'][0](['item' => 'name','order' => 'up','default' => 1], $this);?>
'>
                    <?php echo $this->_plugins['function']['ox_column_title'][0](['item' => 'name','order' => 'up','default' => 1,'str' => 'Name','url' => "affiliate-zones.php"], $this);?>

                </th>
                <th class='<?php echo $this->_plugins['function']['ox_column_class'][0](['item' => 'size','order' => 'up','default' => 0], $this);?>
'>
                    <?php echo $this->_plugins['function']['ox_column_title'][0](['item' => 'size','order' => 'up','default' => 0,'str' => 'Size','url' => "affiliate-zones.php"], $this);?>

                </th>
                <th class='<?php echo $this->_plugins['function']['ox_column_class'][0](['item' => 'update','order' => 'up','default' => 0], $this);?>
'>
                    <?php echo $this->_plugins['function']['ox_column_title'][0](['item' => 'update','order' => 'up','default' => 0,'str' => 'Updated','url' => "affiliate-zones.php"], $this);?>

                </th>
                <th>
                  <?php echo $this->_plugins['function']['t'][0](['str' => 'Description'], $this);?>

                </th>
                <th class='last alignRight'>&nbsp;

                </th>
            </tr>
        </thead>

<?php if (! count($this->_tpl_vars['from'])): ?>
        <tbody>
            <tr class='odd'>
                <td colspan='5'>&nbsp;</td>
            </tr>
            <tr class='even'>
                <td colspan='5' class="hasPanel">
                    <div class='tableMessage'>
                        <div class='panel'>
                            <?php if ($this->_tpl_vars['affiliateId'] != -1): ?>
                                <?php echo $this->_plugins['function']['t'][0](['str' => 'NoZones'], $this);?>

                            <?php else: ?>
                                <?php echo $this->_plugins['function']['t'][0](['str' => 'NoZonesAddWebsite'], $this);?>

                            <?php endif; ?>

                            <div class='corner top-left'></div>
                            <div class='corner top-right'></div>
                            <div class='corner bottom-left'></div>
                            <div class='corner bottom-right'></div>
                        </div>
                    </div>

                    &nbsp;
                </td>
            </tr>
            <tr class='odd'>
                <td colspan='5'>&nbsp;</td>
            </tr>
        </tbody>

<?php else: ?>
        <tbody>
    <?php echo smarty_function_cycle(['name' => 'bgcolor','values' => "even,odd",'assign' => 'bgColor','reset' => 1], $this);?>

    <?php $_from = $this->_tpl_vars['from']; if (!is_array($_from) && !is_object($_from)) { settype($_from, 'array'); }if (count($_from)):
    foreach ($_from as $this->_tpl_vars['zoneId'] => $this->_tpl_vars['zone']):
?>
        <?php echo smarty_function_cycle(['name' => 'bgcolor','assign' => 'bgColor'], $this);?>

            <tr class='<?php echo $this->_tpl_vars['bgColor']; ?>
'>
                <?php if ($this->_tpl_vars['canDelete']): ?>
                <td class='toggleSelection'>
                  <input type='checkbox' value='<?php echo $this->_tpl_vars['zoneId']; ?>
' />
                </td>
                <?php endif; ?>
                <td>
                  <?php if ($this->_tpl_vars['canEdit']): ?>
                      <a href='zone-edit.php?affiliateid=<?php echo $this->_tpl_vars['affiliateId']; ?>
&zoneid=<?php echo $this->_tpl_vars['zoneId']; ?>
' class='inlineIcon <?php echo $this->_plugins['function']['ox_zone_icon'][0](['delivery' => $this->_tpl_vars['zone']['delivery'],'active' => $this->_tpl_vars['zone']['active'],'warning' => $this->_tpl_vars['zone']['lowPriorityWarning']], $this);?>
'><?php echo ((is_array($_tmp=$this->_tpl_vars['zone']['zonename'])) ? $this->_run_mod_handler('escape', true, $_tmp, 'html') : smarty_modifier_escape($_tmp, 'html')); ?>
</a>
                    <?php else: ?>
                      <span class='inlineIcon <?php echo $this->_plugins['function']['ox_zone_icon'][0](['delivery' => $this->_tpl_vars['zone']['delivery'],'active' => $this->_tpl_vars['zone']['active'],'warning' => $this->_tpl_vars['zone']['lowPriorityWarning']], $this);?>
'><?php echo ((is_array($_tmp=$this->_tpl_vars['zone']['zonename'])) ? $this->_run_mod_handler('escape', true, $_tmp, 'html') : smarty_modifier_escape($_tmp, 'html')); ?>
</span>
                    <?php endif; ?>
                  <?php echo $this->_plugins['function']['ox_entity_id'][0](['type' => 'Zone','id' => $this->_tpl_vars['zoneId']], $this);?>

                </td>
                <td>
                    <?php echo $this->_plugins['function']['ox_zone_size'][0](['width' => $this->_tpl_vars['zone']['width'],'height' => $this->_tpl_vars['zone']['height'],'delivery' => $this->_tpl_vars['zone']['delivery']], $this);?>

                </td>
                <td>
                    <?php echo $this->_plugins['function']['ox_column_updated'][0](['updated' => $this->_tpl_vars['zone']['updated']], $this);?>

                </td>
                <td>
                    <?php echo ((is_array($_tmp=((is_array($_tmp=$this->_tpl_vars['zone']['description'])) ? $this->_run_mod_handler('escape', true, $_tmp, 'html') : smarty_modifier_escape($_tmp, 'html')))) ? $this->_run_mod_handler('default', true, $_tmp, '&nbsp;') : smarty_modifier_default($_tmp, '&nbsp;')); ?>

                </td>
                <td class='alignRight'>
                    <ul class='rowActions'>
                        <?php if ($this->_tpl_vars['canLink']): ?>
                        <li>
                            <a href='zone-include.php?affiliateid=<?php echo $this->_tpl_vars['affiliateId']; ?>
&zoneid=<?php echo $this->_tpl_vars['zoneId']; ?>
' class='inlineIcon iconZoneLinked'><?php echo $this->_plugins['function']['t'][0](['str' => 'IncludedBanners'], $this);?>
</a>
                        </li>
                        <?php endif; ?>
                        <li>
                            <a href='zone-probability.php?affiliateid=<?php echo $this->_tpl_vars['affiliateId']; ?>
&zoneid=<?php echo $this->_tpl_vars['zoneId']; ?>
' class='inlineIcon iconZoneProbability'><?php echo $this->_plugins['function']['t'][0](['str' => 'Probability'], $this);?>
</a>
                        </li>
                        <?php if ($this->_tpl_vars['canInvocation']): ?>
                        <li>
                            <a href='zone-invocation.php?affiliateid=<?php echo $this->_tpl_vars['affiliateId']; ?>
&zoneid=<?php echo $this->_tpl_vars['zoneId']; ?>
' class='inlineIcon iconZoneInvocation'><?php echo $this->_plugins['function']['t'][0](['str' => 'Invocationcode'], $this);?>
</a>
                        </li>
                        <?php endif; ?>
                    </ul>
                </td>
            </tr>
    <?php endforeach; endif; unset($_from); ?>
       </tbody>
<?php endif; ?>
    </table>
</div>